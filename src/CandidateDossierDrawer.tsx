import { useEffect, useState } from "react";
import {
  X,
  Calendar,
  ClipboardCheck,
  Award,
  CheckCircle2,
  Clock,
  Sparkles
} from "lucide-react";
import type {
  Candidate,
  CandidateEvent,
  JobOpening,
  ApplicationStatus,
  InterviewPlan,
  InterviewScorecard,
  JobOffer,
  OnboardingRecord
} from "./types";
import { STATUS_LABELS } from "./types";
import { formatDate } from "./utils";
import {
  fetchCandidateInterviews,
  scheduleInterview,
  submitScorecard,
  fetchOffers,
  createJobOffer,
  updateJobOfferStatus,
  fetchOnboardingRecords,
  updateOnboardingRecord,
  submitRecruiterMatchFeedback
} from "./api";

interface CandidateDossierDrawerProps {
  detail: { candidate: Candidate; events: CandidateEvent[] } | null;
  blindMode: boolean;
  jobs?: JobOpening[];
  onClose: () => void;
  onRevealIdentity: () => void;
  onSave: (updates: Partial<Candidate>) => void;
}

export function CandidateDossierDrawer({
  detail,
  blindMode,
  jobs = [],
  onClose,
  onRevealIdentity,
  onSave
}: CandidateDossierDrawerProps) {
  const [tab, setTab] = useState<
    "overview" | "evidence" | "experience" | "skills" | "interviews" | "offers" | "calibration" | "activity"
  >("overview");

  // Interviews State
  const [interviews, setInterviews] = useState<InterviewPlan[]>([]);
  const [scorecards, setScorecards] = useState<InterviewScorecard[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedTitle, setSchedTitle] = useState("Technical Assessment");
  const [schedType, setSchedType] = useState<InterviewPlan["interviewType"]>("technical");
  const [schedInterviewer, setSchedInterviewer] = useState("Technical Hiring Lead");
  const [schedDateTime, setSchedDateTime] = useState("");
  const [schedLink, setSchedLink] = useState("https://meet.google.com/nex-hire-eval");
  const [activeScorecardPlanId, setActiveScorecardPlanId] = useState<string | null>(null);

  // Scorecard Form State
  const [scTechScore, setScTechScore] = useState(4);
  const [scCommScore, setScCommScore] = useState(4);
  const [scProblemScore, setScProblemScore] = useState(4);
  const [scCultureScore, setScCultureScore] = useState(5);
  const [scRecommendation, setScRecommendation] = useState<InterviewScorecard["overallRecommendation"]>("hire");
  const [scStrengths, setScStrengths] = useState("");
  const [scConcerns, setScConcerns] = useState("");
  const [scFeedback, setScFeedback] = useState("");

  // Offers State
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRecord | null>(null);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [offerTitle, setOfferTitle] = useState("");
  const [offerSalary, setOfferSalary] = useState(145000);
  const [offerCurrency, setOfferCurrency] = useState("USD");
  const [offerBonus, setOfferBonus] = useState(15000);
  const [offerEquity, setOfferEquity] = useState("0.25%");
  const [offerJoiningDate, setOfferJoiningDate] = useState("");

  // Recruiter Match Calibration State
  const [overrideScore, setOverrideScore] = useState(85);
  const [calibrationCategory, setCalibrationCategory] = useState<
    "skill_accuracy" | "experience_relevance" | "false_positive" | "false_negative" | "general"
  >("experience_relevance");
  const [calibrationComments, setCalibrationComments] = useState("");
  const [calibrationSubmitted, setCalibrationSubmitted] = useState(false);

  const cand = detail?.candidate;

  useEffect(() => {
    if (!cand) return;
    if (tab === "interviews") {
      setLoadingInterviews(true);
      fetchCandidateInterviews(cand.id)
        .then((res) => {
          setInterviews(res.interviews || []);
          setScorecards(res.scorecards || []);
        })
        .catch(() => {})
        .finally(() => setLoadingInterviews(false));
    } else if (tab === "offers") {
      setLoadingOffers(true);
      Promise.all([fetchOffers(), fetchOnboardingRecords()])
        .then(([allOffers, allOnboarding]) => {
          setOffers(allOffers.filter((o) => o.candidateId === cand.id));
          const candOnb = allOnboarding.find((rec) => rec.candidateId === cand.id) || null;
          setOnboarding(candOnb);
        })
        .catch(() => {})
        .finally(() => setLoadingOffers(false));
    }
  }, [cand?.id, tab]);

  if (!detail || !cand) return null;

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cand) return;
    try {
      const newPlan = await scheduleInterview({
        candidateId: cand.id,
        title: schedTitle,
        interviewType: schedType,
        interviewerName: schedInterviewer,
        scheduledAt: schedDateTime || new Date(Date.now() + 86400000 * 2).toISOString(),
        meetingLink: schedLink,
        notes: "Round scheduled via Recruiter ATS Drawer",
        status: "scheduled"
      });
      setInterviews((prev) => [newPlan, ...prev]);
      setShowScheduleModal(false);
    } catch (err) {
      alert("Failed to schedule interview: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleScorecardSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cand || !activeScorecardPlanId) return;
    try {
      const sc = await submitScorecard({
        interviewPlanId: activeScorecardPlanId,
        candidateId: cand.id,
        interviewerName: schedInterviewer,
        technicalRating: scTechScore,
        communicationRating: scCommScore,
        problemSolvingRating: scProblemScore,
        cultureFitRating: scCultureScore,
        overallRecommendation: scRecommendation,
        strengths: scStrengths,
        concerns: scConcerns,
        detailedFeedback: scFeedback
      });
      setScorecards((prev) => [sc, ...prev]);
      setActiveScorecardPlanId(null);
      setScFeedback("");
    } catch (err) {
      alert("Failed to submit scorecard: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleCreateOfferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cand) return;
    try {
      const created = await createJobOffer({
        candidateId: cand.id,
        jobId: jobs[0]?.id || undefined,
        jobTitle: offerTitle || cand.currentTitle || "Senior Software Engineer",
        baseSalary: Number(offerSalary),
        currency: offerCurrency,
        bonus: Number(offerBonus),
        equity: offerEquity,
        joiningDate: offerJoiningDate || new Date(Date.now() + 86400000 * 14).toISOString().split("T")[0],
        status: "draft"
      });
      setOffers((prev) => [created, ...prev]);
      setShowCreateOffer(false);
    } catch (err) {
      alert("Failed to create offer: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleUpdateOfferStatus(offerId: string, status: JobOffer["status"]) {
    try {
      const updated = await updateJobOfferStatus(offerId, status);
      setOffers((prev) => prev.map((o) => (o.id === offerId ? updated : o)));
      if (status === "accepted") {
        onSave({ status: "hired" });
      }
    } catch (err) {
      alert("Failed to update offer status: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleToggleOnboardingTask(key: keyof OnboardingRecord) {
    if (!onboarding) return;
    const currentVal = Boolean(onboarding[key]);
    try {
      const updated = await updateOnboardingRecord(onboarding.id, {
        [key]: !currentVal
      });
      setOnboarding(updated);
    } catch (err) {
      alert("Failed to update onboarding task: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async function handleCalibrationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cand) return;
    try {
      await submitRecruiterMatchFeedback({
        candidateId: cand.id,
        jobId: jobs[0]?.id || "default-job",
        overrideScore: Number(overrideScore),
        feedbackCategory: calibrationCategory,
        comments: calibrationComments
      });
      setCalibrationSubmitted(true);
      setTimeout(() => setCalibrationSubmitted(false), 4000);
    } catch (err) {
      alert("Failed to submit feedback: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "600px",
        height: "100vh",
        background: "#fff",
        boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.15)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          background: "#fafafa"
        }}
      >
        <div>
          {blindMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="blind-badge" style={{ fontSize: "14px", padding: "4px 8px" }}>
                #{cand.blindId}
              </div>
              <button
                onClick={onRevealIdentity}
                style={{
                  fontSize: "12px",
                  background: "none",
                  border: "1px solid var(--line)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Reveal Identity (Logs Audit)
              </button>
            </div>
          ) : (
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>{cand.canonicalName}</h2>
              <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>
                {cand.currentTitle} • {cand.location}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", color: "#64748b", padding: "4px" }}
        >
          <X size={20} />
        </button>
      </div>

      {/* TABS HEADER */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--line)",
          padding: "0 16px",
          overflowX: "auto",
          background: "#fff"
        }}
      >
        {[
          { key: "overview", label: "Overview" },
          { key: "interviews", label: "Interviews" },
          { key: "offers", label: "Offers" },
          { key: "calibration", label: "AI Calibration" },
          { key: "evidence", label: "Evidence" },
          { key: "experience", label: "Experience" },
          { key: "skills", label: "Skills" },
          { key: "activity", label: "Activity" }
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key as typeof tab)}
            style={{
              padding: "12px 14px",
              border: "none",
              background: "none",
              borderBottom: tab === item.key ? "2px solid var(--brand)" : "none",
              color: tab === item.key ? "var(--brand)" : "var(--muted)",
              fontWeight: tab === item.key ? 700 : 500,
              fontSize: "12px",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* BODY CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {/* 1. OVERVIEW */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <strong style={{ display: "block", marginBottom: "6px", color: "#0f172a" }}>Profile Intelligence</strong>
              <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>
                {cand.profileSummary || "Profile intelligence extracted from resume."}
              </p>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "6px" }}>Candidate Stage</strong>
              <select
                value={cand.status}
                onChange={(e) => onSave({ status: e.target.value as ApplicationStatus })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "#fff",
                  fontSize: "13px"
                }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "8px" }}>Data Completeness Health</strong>
              <div style={{ background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" }}>
                <div style={{ width: `${cand.dataQualityScore}%`, background: "var(--brand)", height: "100%" }} />
              </div>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>{cand.dataQualityScore}% profile health score</span>
            </div>

            {!blindMode && (
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <strong style={{ display: "block", marginBottom: "6px" }}>Contact Intelligence</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", color: "#475569" }}>
                  <div>Email: {cand.email || "Confidential"}</div>
                  <div>Phone: {cand.phone || "Confidential"}</div>
                  <div>Location: {cand.location || "Remote / Unspecified"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. INTERVIEWS & SCORECARDS */}
        {tab === "interviews" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "14px" }}>Structured Interview Rounds</strong>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>Coordinate rounds and record evaluator scorecards</div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                style={{
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Calendar size={14} />
                <span>Schedule Round</span>
              </button>
            </div>

            {loadingInterviews && <div style={{ color: "var(--muted)" }}>Loading interview schedule...</div>}

            {!loadingInterviews && interviews.length === 0 && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "24px",
                  borderRadius: "8px",
                  textAlign: "center",
                  border: "1px dashed #cbd5e1"
                }}
              >
                <Clock size={28} color="#94a3b8" style={{ marginBottom: "8px" }} />
                <div style={{ fontWeight: 600, color: "#334155" }}>No Interviews Scheduled Yet</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  Set up technical screening, manager interviews, or executive rounds.
                </div>
              </div>
            )}

            {interviews.map((plan) => {
              const matchedScorecards = scorecards.filter((sc) => sc.interviewPlanId === plan.id);
              const isGrading = activeScorecardPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: "13px", color: "#0f172a" }}>{plan.title}</strong>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        Interviewer: {plan.interviewerName} • Type: {plan.interviewType}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: plan.status === "completed" ? "#dcfce7" : "#dbeafe",
                        color: plan.status === "completed" ? "#166534" : "#1e40af"
                      }}
                    >
                      {plan.status}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    Scheduled: {plan.scheduledAt ? formatDate(plan.scheduledAt) : "Date pending"}
                  </div>

                  {/* SCORECARDS FOR THIS ROUND */}
                  {matchedScorecards.length > 0 && (
                    <div style={{ background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <strong style={{ fontSize: "11px", color: "#0f172a", textTransform: "uppercase" }}>
                        Submitted Scorecard:
                      </strong>
                      {matchedScorecards.map((sc) => (
                        <div key={sc.id} style={{ marginTop: "4px", fontSize: "12px" }}>
                          <div style={{ display: "flex", gap: "12px", marginBottom: "4px" }}>
                            <span>Tech: <strong>{sc.technicalRating}/5</strong></span>
                            <span>Comm: <strong>{sc.communicationRating}/5</strong></span>
                            <span>Culture: <strong>{sc.cultureFitRating}/5</strong></span>
                            <span
                              style={{
                                color: sc.overallRecommendation.includes("hire") && !sc.overallRecommendation.includes("no") ? "#166534" : "#991b1b",
                                fontWeight: 700
                              }}
                            >
                              {sc.overallRecommendation.toUpperCase().replace("_", " ")}
                            </span>
                          </div>
                          {sc.detailedFeedback && <div style={{ color: "#64748b", fontStyle: "italic" }}>"{sc.detailedFeedback}"</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {!isGrading ? (
                    <button
                      type="button"
                      onClick={() => setActiveScorecardPlanId(plan.id)}
                      style={{
                        alignSelf: "flex-start",
                        background: "#fff",
                        border: "1px solid var(--line)",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      <ClipboardCheck size={13} />
                      <span>{matchedScorecards.length ? "Add Another Scorecard" : "Fill Scorecard"}</span>
                    </button>
                  ) : (
                    /* SCORECARD SUBMISSION FORM */
                    <form
                      onSubmit={handleScorecardSubmit}
                      style={{
                        background: "#fff",
                        padding: "12px",
                        borderRadius: "6px",
                        border: "1px solid var(--brand)",
                        marginTop: "8px"
                      }}
                    >
                      <strong style={{ fontSize: "12px", display: "block", marginBottom: "8px" }}>
                        Submit Evaluation Scorecard
                      </strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)" }}>Tech (1-5)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={scTechScore}
                            onChange={(e) => setScTechScore(Number(e.target.value))}
                            style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)" }}>Comm (1-5)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={scCommScore}
                            onChange={(e) => setScCommScore(Number(e.target.value))}
                            style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)" }}>Problem (1-5)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={scProblemScore}
                            onChange={(e) => setScProblemScore(Number(e.target.value))}
                            style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)" }}>Culture (1-5)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={scCultureScore}
                            onChange={(e) => setScCultureScore(Number(e.target.value))}
                            style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "8px" }}>
                        <label style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                          Recommendation Decision
                        </label>
                        <select
                          value={scRecommendation}
                          onChange={(e) => setScRecommendation(e.target.value as typeof scRecommendation)}
                          style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                        >
                          <option value="strong_hire">Strong Hire (Top Tier)</option>
                          <option value="hire">Hire (Meets Standard)</option>
                          <option value="neutral">Neutral (Borderline)</option>
                          <option value="no_hire">No Hire (Below Bar)</option>
                          <option value="strong_no_hire">Strong No Hire (Definite Pass)</option>
                        </select>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Strengths</label>
                          <input
                            type="text"
                            value={scStrengths}
                            onChange={(e) => setScStrengths(e.target.value)}
                            placeholder="Key strengths observed..."
                            style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Concerns</label>
                          <input
                            type="text"
                            value={scConcerns}
                            onChange={(e) => setScConcerns(e.target.value)}
                            placeholder="Potential risks or gaps..."
                            style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <label style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                          Detailed Feedback Notes
                        </label>
                        <textarea
                          rows={2}
                          value={scFeedback}
                          onChange={(e) => setScFeedback(e.target.value)}
                          placeholder="Specific competencies, code quality, behavioral observations..."
                          style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="submit"
                          style={{
                            background: "var(--brand)",
                            color: "#fff",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "4px",
                            fontWeight: 600,
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          Save Scorecard
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveScorecardPlanId(null)}
                          style={{
                            background: "#f1f5f9",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}

            {/* SCHEDULE MODAL */}
            {showScheduleModal && (
              <form
                onSubmit={handleScheduleSubmit}
                style={{
                  background: "#fff",
                  border: "1px solid var(--brand)",
                  padding: "16px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
              >
                <strong style={{ fontSize: "13px", display: "block", marginBottom: "10px" }}>
                  Schedule New Interview Round
                </strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Round Title</label>
                    <input
                      type="text"
                      value={schedTitle}
                      onChange={(e) => setSchedTitle(e.target.value)}
                      required
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Interview Type</label>
                    <select
                      value={schedType}
                      onChange={(e) => setSchedType(e.target.value as typeof schedType)}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    >
                      <option value="screening">Initial Screening</option>
                      <option value="technical">Technical Evaluation</option>
                      <option value="system_design">System Architecture</option>
                      <option value="cultural">Culture & Leadership</option>
                      <option value="executive">Executive Interview</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Interviewer Name</label>
                    <input
                      type="text"
                      value={schedInterviewer}
                      onChange={(e) => setSchedInterviewer(e.target.value)}
                      required
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Scheduled Time</label>
                    <input
                      type="datetime-local"
                      value={schedDateTime}
                      onChange={(e) => setSchedDateTime(e.target.value)}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "11px", color: "var(--muted)" }}>Meeting Link</label>
                  <input
                    type="text"
                    value={schedLink}
                    onChange={(e) => setSchedLink(e.target.value)}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="submit"
                    style={{
                      background: "var(--brand)",
                      color: "#fff",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Confirm Round
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: "4px" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* 3. OFFERS & ONBOARDING */}
        {tab === "offers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "14px" }}>Job Offer & Onboarding Lifecycle</strong>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Issue compensation terms and monitor pre-boarding tasks
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOffer(true)}
                style={{
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Award size={14} />
                <span>Create Offer</span>
              </button>
            </div>

            {loadingOffers && <div style={{ color: "var(--muted)" }}>Loading offer details...</div>}

            {/* OFFERS LIST */}
            {offers.map((off) => (
              <div
                key={off.id}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "16px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <div>
                    <strong style={{ fontSize: "14px", color: "#0f172a" }}>{off.jobTitle || "Job Offer"}</strong>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Target Start: {off.joiningDate}</div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background:
                        off.status === "accepted"
                          ? "#dcfce7"
                          : off.status === "sent"
                          ? "#dbeafe"
                          : off.status === "declined"
                          ? "#fee2e2"
                          : "#f1f5f9",
                      color:
                        off.status === "accepted"
                          ? "#166534"
                          : off.status === "sent"
                          ? "#1e40af"
                          : off.status === "declined"
                          ? "#991b1b"
                          : "#475569"
                    }}
                  >
                    {off.status}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "8px",
                    background: "#fff",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "12px"
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Base Salary</span>
                    <strong>
                      {off.currency} {off.baseSalary.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Performance Bonus</span>
                    <strong>
                      {off.currency} {(off.bonus || 0).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Equity Grant</span>
                    <strong>{off.equity || "0%"}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {off.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateOfferStatus(off.id, "sent")}
                      style={{
                        background: "var(--brand)",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Dispatch Offer Letter
                    </button>
                  )}
                  {off.status === "sent" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleUpdateOfferStatus(off.id, "accepted")}
                        style={{
                          background: "#16a34a",
                          color: "#fff",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Mark Accepted (Hire)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateOfferStatus(off.id, "declined")}
                        style={{
                          background: "#dc2626",
                          color: "#fff",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Mark Declined
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* CREATE OFFER FORM */}
            {showCreateOffer && (
              <form
                onSubmit={handleCreateOfferSubmit}
                style={{
                  background: "#fff",
                  border: "1px solid var(--brand)",
                  padding: "16px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
              >
                <strong style={{ fontSize: "13px", display: "block", marginBottom: "10px" }}>
                  Draft Employment Offer Package
                </strong>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "11px", color: "var(--muted)" }}>Job Title / Role</label>
                  <input
                    type="text"
                    value={offerTitle}
                    placeholder={cand.currentTitle || "e.g. Staff Full-Stack Engineer"}
                    onChange={(e) => setOfferTitle(e.target.value)}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Base Salary</label>
                    <input
                      type="number"
                      value={offerSalary}
                      onChange={(e) => setOfferSalary(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Currency</label>
                    <input
                      type="text"
                      value={offerCurrency}
                      onChange={(e) => setOfferCurrency(e.target.value)}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Sign-on / Year-1 Bonus</label>
                    <input
                      type="number"
                      value={offerBonus}
                      onChange={(e) => setOfferBonus(Number(e.target.value))}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)" }}>Equity (%)</label>
                    <input
                      type="text"
                      value={offerEquity}
                      onChange={(e) => setOfferEquity(e.target.value)}
                      placeholder="0.25%"
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "11px", color: "var(--muted)" }}>Target Start Date</label>
                  <input
                    type="date"
                    value={offerJoiningDate}
                    onChange={(e) => setOfferJoiningDate(e.target.value)}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid var(--line)" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="submit"
                    style={{
                      background: "var(--brand)",
                      color: "#fff",
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Save Offer Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateOffer(false)}
                    style={{ background: "#f1f5f9", border: "none", padding: "6px 12px", borderRadius: "4px" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* ONBOARDING CHECKLIST */}
            {onboarding && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "16px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <strong style={{ fontSize: "13px", color: "#166534" }}>Pre-Boarding & Onboarding Operations</strong>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "#dcfce7",
                      color: "#166534"
                    }}
                  >
                    {onboarding.status.replace("_", " ")}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { key: "documentsVerified", label: "Right to Work & Identity Background Verified" },
                    { key: "equipmentProvisioned", label: "Laptop & Hardware Provisioned" }
                  ].map((task) => {
                    const isDone = Boolean(onboarding[task.key as keyof OnboardingRecord]);
                    return (
                      <button
                        key={task.key}
                        type="button"
                        onClick={() => handleToggleOnboardingTask(task.key as keyof OnboardingRecord)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: isDone ? "#dcfce7" : "#fff",
                          border: isDone ? "1px solid #86efac" : "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "8px 10px",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: "12px",
                          color: isDone ? "#166534" : "#334155"
                        }}
                      >
                        <CheckCircle2 size={16} color={isDone ? "#16a34a" : "#94a3b8"} />
                        <span style={{ fontWeight: isDone ? 600 : 400 }}>{task.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. RECRUITER AI MATCH CALIBRATION */}
        {tab === "calibration" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", padding: "14px", borderRadius: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <Sparkles size={16} color="var(--brand)" />
                <strong style={{ color: "var(--brand-strong)" }}>AI Match Calibration & Active Feedback Loop</strong>
              </div>
              <p style={{ margin: 0, color: "#134e4a", fontSize: "12px", lineHeight: 1.5 }}>
                Human-in-the-loop calibration. Overriding this match score updates the embedding weighting matrix and logs
                audit data for continuous talent intelligence tuning.
              </p>
            </div>

            <form onSubmit={handleCalibrationSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Calibrated Match Score: <strong style={{ color: "var(--brand)" }}>{overrideScore}%</strong>
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--brand)" }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Calibration Reason</label>
                <select
                  value={calibrationCategory}
                  onChange={(e) => setCalibrationCategory(e.target.value as typeof calibrationCategory)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
                >
                  <option value="experience_relevance">Experience Relevance (Deep Domain Knowledge)</option>
                  <option value="skill_accuracy">Skill Accuracy (Algorithm missed or overfit)</option>
                  <option value="false_positive">False Positive (Keyword stuffing detected)</option>
                  <option value="false_negative">False Negative (Under-scored strong talent)</option>
                  <option value="general">General Recruiter Assessment</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Recruiter Notes</label>
                <textarea
                  rows={3}
                  value={calibrationComments}
                  onChange={(e) => setCalibrationComments(e.target.value)}
                  placeholder="e.g. Led high-scale microservices migration at previous employer; algorithms missed deep architectural contributions."
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <CheckCircle2 size={16} />
                <span>Submit Calibration & Tune Engine</span>
              </button>

              {calibrationSubmitted && (
                <div
                  style={{
                    background: "#dcfce7",
                    color: "#166534",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "12px",
                    textAlign: "center"
                  }}
                >
                  Calibration logged successfully! Engine weights calibrated for this candidate.
                </div>
              )}
            </form>
          </div>
        )}

        {/* 5. EVIDENCE */}
        {tab === "evidence" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", padding: "14px", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 6px", color: "var(--brand-strong)" }}>Algorithm Match Breakdown</h4>
              <p style={{ margin: 0, color: "#134e4a" }}>
                Evaluated against core requisition: <strong>35/35</strong> Required Skills, <strong>15/15</strong> Experience Fit,{" "}
                <strong>10/10</strong> Education, <strong>18/20</strong> Semantic Alignment.
              </p>
            </div>

            <div>
              <strong style={{ display: "block", marginBottom: "8px" }}>Verified Skill Quotes</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {cand.skills.map((s, idx) => (
                  <div key={idx} style={{ background: "#f8fafc", padding: "10px", borderRadius: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong>{s.skillName}</strong>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>{s.proficiency}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
                      "{s.evidenceText}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 6. EXPERIENCE */}
        {tab === "experience" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Structured Career Timeline</strong>
            {cand.experiences.map((exp) => (
              <div key={exp.id} style={{ borderLeft: "2px solid var(--brand)", paddingLeft: "14px" }}>
                <strong style={{ display: "block" }}>{exp.title}</strong>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                  {exp.company} • {exp.startDate} – {exp.endDate}
                </div>
                <p style={{ margin: 0, color: "#475569" }}>{exp.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* 7. SKILLS */}
        {tab === "skills" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Global Skills Taxonomy Matrix</strong>
            {cand.skills.map((s, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f8fafc",
                  borderRadius: "6px"
                }}
              >
                <span>{s.skillName}</span>
                <span style={{ color: "var(--brand)", fontWeight: 600 }}>{s.proficiency}</span>
              </div>
            ))}
          </div>
        )}

        {/* 8. ACTIVITY */}
        {tab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
            <strong style={{ fontSize: "14px" }}>Longitudinal Event Audit</strong>
            {detail.events.map((ev) => (
              <div key={ev.id} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{ev.eventType}</strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatDate(ev.createdAt)}</span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>Actor: {ev.actorId}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
