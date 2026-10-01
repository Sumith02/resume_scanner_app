import io
import shutil
import subprocess
import sys
import zipfile

import pytest
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfWriter

from backend.document_reader import DocumentReadError, read_document
from backend.resume_service import is_valid_resume_content

TEXT = "Anita Rao\nanita@example.com\nEducation: Bachelor of Arts\nExperience: Receptionist, 2021 - Present\nSkills: Scheduling, customer care"


def image_resume(format="PNG"):
    image = Image.new("RGB", (1800, 900), "white")
    draw = ImageDraw.Draw(image)
    draw.multiline_text((70, 70), TEXT, font=ImageFont.load_default(size=38), fill="black", spacing=30)
    output = io.BytesIO()
    image.save(output, format=format)
    return output.getvalue()


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract integration dependency is not installed")
@pytest.mark.parametrize("filename,format", [("attachment.png", "PNG"), ("scan.pdf", "PDF")])
def test_real_ocr_reads_image_and_scanned_pdf(filename, format):
    text = read_document(filename, image_resume(format))
    assert "anita@example.com" in text.lower()
    assert is_valid_resume_content(text, filename, strict=True)[0], text


def test_rtf_and_odt_are_parsed_as_documents():
    rtf = b"{\\rtf1\\ansi Anita Rao\\par anita@example.com\\par Education: BA\\par Skills: Python}"
    assert "Education: BA" in read_document("profile.rtf", rtf)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as document:
        document.writestr("content.xml", '<document xmlns:t="urn:text"><t:p>Anita Rao</t:p><t:p>Education: BA</t:p></document>')
    assert read_document("profile.odt", archive.getvalue()) == "Anita Rao\nEducation: BA"


def test_encrypted_pdf_and_corrupt_binary_have_actionable_errors():
    writer = PdfWriter()
    writer.add_blank_page(width=600, height=800)
    writer.encrypt("password")
    output = io.BytesIO()
    writer.write(output)
    with pytest.raises(DocumentReadError, match="password protected"):
        read_document("locked.pdf", output.getvalue())
    with pytest.raises(DocumentReadError, match="damaged"):
        read_document("broken.pdf", b"%PDF-garbage")
    with pytest.raises(DocumentReadError, match="unreadable"):
        read_document("broken.docx", b"\x00\x01\x02binary")


def test_missing_ocr_is_retryable_and_clear(monkeypatch):
    monkeypatch.setattr("backend.document_reader.shutil.which", lambda name: None)
    with pytest.raises(DocumentReadError, match="Install Tesseract"):
        read_document("scan.png", image_resume())


def test_ocr_deadline_is_actionable(monkeypatch):
    monkeypatch.setattr("backend.document_reader.shutil.which", lambda name: "/test/tesseract")
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("ocr", 60)
    monkeypatch.setattr("backend.document_reader.subprocess.run", timeout)
    with pytest.raises(DocumentReadError, match="timed out"):
        read_document("scan.png", image_resume())


def test_large_scanned_images_fail_safely_before_ocr(monkeypatch):
    output = io.BytesIO()
    Image.new("RGB", (4000, 3000), "white").save(output, format="PNG")
    monkeypatch.setattr(
        "backend.document_reader._ocr",
        lambda *_args, **_kwargs: pytest.fail("oversized image must not start OCR"),
    )
    with pytest.raises(DocumentReadError, match="10 megapixel limit"):
        read_document("large-scan.png", output.getvalue())


def test_local_pdf_ocr_restarts_worker_for_each_scanned_page(monkeypatch):
    calls = []

    def run(args, **_kwargs):
        calls.append(args[-1])
        return subprocess.CompletedProcess(args, 0, stdout=f'{{"{args[-1]}":"page text"}}'.encode())

    monkeypatch.setattr("backend.document_reader.shutil.which", lambda _name: "/test/tesseract")
    monkeypatch.setattr("backend.document_reader.subprocess.run", run)
    writer = PdfWriter()
    writer.add_blank_page(width=600, height=800)
    writer.add_blank_page(width=600, height=800)
    pdf_data = io.BytesIO()
    writer.write(pdf_data)
    result = read_document("scan.pdf", pdf_data.getvalue())
    assert calls == ["0", "1"]
    assert "page text" in result


def test_google_vision_ocr_sends_one_bounded_page_at_a_time(monkeypatch):
    from types import SimpleNamespace
    import sys

    scales = []
    closed = []

    class Bitmap:
        def to_pil(self):
            return Image.new("RGB", (20, 20), "white")

        def close(self):
            closed.append("bitmap")

    class Page:
        def get_size(self):
            return (600, 800)

        def render(self, scale):
            scales.append(scale)
            return Bitmap()

        def close(self):
            closed.append("page")

    class Pdf:
        def __init__(self, _data):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            closed.append("document")

        def __getitem__(self, _index):
            return Page()

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def post(self, _endpoint, *, params, json):
            assert params == {"key": "test-key"}
            assert len(json["requests"]) == 1
            return SimpleNamespace(
                is_error=False,
                json=lambda: {"responses": [{"fullTextAnnotation": {"text": "page text"}}]},
            )

    monkeypatch.setitem(sys.modules, "pypdfium2", SimpleNamespace(PdfDocument=Pdf))
    monkeypatch.setattr("httpx.Client", lambda **_kwargs: Client())
    monkeypatch.setenv("GOOGLE_VISION_API_KEY", "test-key")
    from backend.document_reader import _google_vision_ocr

    text = _google_vision_ocr(b"pdf", "pdf", [0, 1])
    assert '"0": "page text"' in text and '"1": "page text"' in text
    assert len(scales) == 2 and all(scale <= 2 for scale in scales)
    assert closed.count("bitmap") == closed.count("page") == 2


@pytest.mark.skipif(sys.platform != "darwin" or not shutil.which("textutil"), reason="macOS Word fixture converter")
def test_real_legacy_word_reader():
    result = subprocess.run(["textutil", "-convert", "doc", "-format", "txt", "-stdin", "-stdout"],
                            input=TEXT.encode(), capture_output=True, check=True)
    assert "anita@example.com" in read_document("legacy.doc", result.stdout)


def test_mixed_pdf_runs_ocr_only_on_scanned_pages(monkeypatch):
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    digital = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    digital[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 50 750 Td (Anita Rao anita@example.com Education Bachelor of Arts Skills Scheduling) Tj ET")
    digital[NameObject("/Contents")] = writer._add_object(stream)
    writer.add_blank_page(width=600, height=800)
    output = io.BytesIO()
    writer.write(output)
    calls = []
    def ocr(data, kind, pages):
        calls.append(pages)
        return '{"1": "Experience: Receptionist, 2021 - Present"}'
    monkeypatch.setattr("backend.document_reader._ocr", ocr)
    text = read_document("mixed.pdf", output.getvalue())
    assert calls == [[1]]
    assert "Bachelor of Arts" in text and "Receptionist" in text
