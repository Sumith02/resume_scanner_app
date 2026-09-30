"""Isolated OCR worker; invoked by document_reader, never exposed as an endpoint."""
import io
import json
import os
import subprocess
import sys

from PIL import Image, ImageOps, ImageSequence

MAX_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def recognize(image):
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Image too large")
    image = ImageOps.exif_transpose(image).convert("RGB")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    result = subprocess.run(
        [os.getenv("TESSERACT_CMD", "tesseract"), "stdin", "stdout", "-l",
         os.getenv("OCR_LANGUAGES", "eng"), "--psm", "3"],
        input=buf.getvalue(), capture_output=True, timeout=15, check=True,
        env={**os.environ, "OMP_THREAD_LIMIT": "1"},
    )
    return result.stdout.decode("utf-8")


def main():
    data = sys.stdin.buffer.read()
    if sys.argv[1] == "pdf":
        import pypdfium2 as pdfium
        result = {}
        with pdfium.PdfDocument(data) as doc:
            for index in map(int, sys.argv[2].split(",")):
                page = doc[index]
                width, height = page.get_size()
                scale = min(3, (MAX_PIXELS / max(1, width * height)) ** 0.5)
                bitmap = page.render(scale=scale)
                image = bitmap.to_pil()
                try:
                    result[str(index)] = recognize(image)
                finally:
                    image.close()
                    bitmap.close()
                    page.close()
        print(json.dumps(result))
    else:
        with Image.open(io.BytesIO(data)) as image:
            if getattr(image, "n_frames", 1) > 30:
                raise ValueError("Too many image pages")
            print("\n".join(recognize(frame) for frame in ImageSequence.Iterator(image)))


if __name__ == "__main__":
    main()
