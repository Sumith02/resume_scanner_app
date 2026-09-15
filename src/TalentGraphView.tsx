import { useState, useEffect } from "react";
import { Network, Sparkles, User, Award, Building, Briefcase, GraduationCap, MapPin, CheckCircle } from "lucide-react";
import type { Candidate, TalentGraphData, TalentGraphNode } from "./types";
import { fetchCandidateGraph } from "./api";

interface TalentGraphViewProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  onCompare: (ids: string[]) => void;
}

export function TalentGraphView({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onCompare
}: TalentGraphViewProps) {
  const [activeCandidateId, setActiveCandidateId] = useState<string>(
    selectedCandidateId || (candidates.length > 0 ? candidates[0].id : "")
  );
  const [graphData, setGraphData] = useState<TalentGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<TalentGraphNode | null>(null);

  useEffect(() => {
    if (selectedCandidateId) {
      setActiveCandidateId(selectedCandidateId);
    }
  }, [selectedCandidateId]);

  useEffect(() => {
    if (!activeCandidateId) return;
    setLoading(true);
    fetchCandidateGraph(activeCandidateId)
      .then((res) => {
        setGraphData(res);
        if (res.nodes.length > 0) {
          setSelectedNode(res.nodes[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCandidateId]);

  const activeCandidate = candidates.find((c) => c.id === activeCandidateId);

  const getNodeColor = (type: string) => {
    switch (type) {
      case "candidate":
        return "#0f766e"; // Teal
      case "skill":
        return "#0284c7"; // Sky blue
      case "company":
        return "#7c3aed"; // Purple
      case "role":
        return "#ea580c"; // Orange
      case "education":
        return "#16a34a"; // Green
      case "location":
        return "#db2777"; // Rose
      case "job":
        return "#4f46e5"; // Indigo
      case "interview":
        return "#059669"; // Emerald
      case "similar_candidate":
        return "#dc2626"; // Crimson
      default:
        return "#64748b";
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "candidate":
      case "similar_candidate":
        return <User size={14} color="#fff" />;
      case "skill":
        return <Award size={14} color="#fff" />;
      case "company":
        return <Building size={14} color="#fff" />;
      case "role":
        return <Briefcase size={14} color="#fff" />;
      case "education":
        return <GraduationCap size={14} color="#fff" />;
      case "location":
        return <MapPin size={14} color="#fff" />;
      default:
        return <CheckCircle size={14} color="#fff" />;
    }
  };

  // Radial calculation for nodes around center candidate
  const calculateNodePositions = (nodes: TalentGraphNode[]) => {
    const centerNode = nodes.find((n) => n.type === "candidate") || nodes[0];
    const otherNodes = nodes.filter((n) => n.id !== centerNode?.id);
    const centerX = 360;
    const centerY = 260;
    const radius = 190;

    const positions: Record<string, { x: number; y: number }> = {};
    if (centerNode) {
      positions[centerNode.id] = { x: centerX, y: centerY };
    }

    const angleStep = (2 * Math.PI) / Math.max(1, otherNodes.length);
    otherNodes.forEach((node, i) => {
      // Add slight jitter for visual organic feel
      const r = radius + (i % 2 === 0 ? 25 : -25);
      const angle = i * angleStep;
      positions[node.id] = {
        x: centerX + r * Math.cos(angle),
        y: centerY + r * Math.sin(angle)
      };
    });

    return { positions, centerNode };
  };

  const { positions, centerNode } = graphData
    ? calculateNodePositions(graphData.nodes)
    : { positions: {} as Record<string, { x: number; y: number }>, centerNode: null };

  return (
    <div className="talent-graph-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Network size={20} color="var(--brand)" />
            <h2 style={{ margin: 0, fontSize: "20px" }}>Talent Knowledge Graph</h2>
            <span style={{ background: "#f3e8ff", color: "#7e22ce", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px" }}>
              Relational Intelligence
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Unifying Candidates, Skills, Past Employers, Education, Location, Vacancies Applied, and Similar Candidate memory networks.
          </p>
        </div>

        {/* Candidate Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Focus Candidate:</label>
          <select
            value={activeCandidateId}
            onChange={(e) => setActiveCandidateId(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)", background: "#fff", fontSize: "13px", fontWeight: 600 }}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.canonicalName} ({c.currentTitle || c.primaryDomain})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICS STRIP */}
      {graphData?.metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "16px" }}>
          <div className="kpi-card" style={{ padding: "12px 16px" }}>
            <span className="kpi-title">TOTAL GRAPH NODES</span>
            <span className="kpi-val" style={{ fontSize: "18px" }}>{graphData.metrics.totalNodes}</span>
          </div>
          <div className="kpi-card" style={{ padding: "12px 16px" }}>
            <span className="kpi-title">RELATIONSHIPS</span>
            <span className="kpi-val" style={{ fontSize: "18px" }}>{graphData.metrics.totalRelationships}</span>
          </div>
          <div className="kpi-card" style={{ padding: "12px 16px" }}>
            <span className="kpi-title">VERIFIED SKILLS</span>
            <span className="kpi-val" style={{ fontSize: "18px" }}>{graphData.metrics.skillsCount}</span>
          </div>
          <div className="kpi-card" style={{ padding: "12px 16px" }}>
            <span className="kpi-title">ALUMNI EMPLOYERS</span>
            <span className="kpi-val" style={{ fontSize: "18px" }}>{graphData.metrics.companiesCount}</span>
          </div>
          <div className="kpi-card" style={{ padding: "12px 16px" }}>
            <span className="kpi-title">SIMILAR CANDIDATES</span>
            <span className="kpi-val" style={{ fontSize: "18px", color: "#dc2626" }}>{graphData.metrics.similarCandidatesCount}</span>
          </div>
        </div>
      )}

      {/* MAIN GRAPH CANVAS & DETAILS SPLIT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px" }}>
        {/* SVG GRAPH CANVAS */}
        <div className="talent-graph-container">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={16} color="#38bdf8" />
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Relational Network: {activeCandidate?.canonicalName}
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
              Click any node to inspect relationship data
            </span>
          </div>

          <div className="graph-canvas-wrapper">
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: "13px" }}>
                Computing talent knowledge graph...
              </div>
            ) : (
              <svg width="100%" height="100%" viewBox="0 0 720 520">
                {/* Graph Links */}
                {graphData?.links.map((link, idx) => {
                  const src = positions[link.source];
                  const tgt = positions[link.target];
                  if (!src || !tgt) return null;
                  return (
                    <g key={idx}>
                      <line
                        x1={src.x}
                        y1={src.y}
                        x2={tgt.x}
                        y2={tgt.y}
                        stroke={link.relation === "SIMILAR_TO" ? "#f87171" : "#334155"}
                        strokeWidth={link.relation === "SIMILAR_TO" ? 2.5 : 1.5}
                        strokeDasharray={link.relation === "SIMILAR_TO" ? "4,4" : undefined}
                      />
                    </g>
                  );
                })}

                {/* Graph Nodes */}
                {graphData?.nodes.map((node) => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  const isCenter = node.id === centerNode?.id;
                  const isSelected = selectedNode?.id === node.id;
                  const color = getNodeColor(node.type);
                  const radius = isCenter ? 32 : node.type === "similar_candidate" ? 24 : 18;

                  return (
                    <g
                      key={node.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Selection ring */}
                      {isSelected && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={radius + 6}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          strokeDasharray="3,3"
                        />
                      )}

                      {/* Main Node Circle */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={radius}
                        fill={color}
                        stroke={isCenter ? "#ffffff" : "#0f172a"}
                        strokeWidth={2}
                      />

                      {/* Text Label */}
                      <text
                        x={pos.x}
                        y={pos.y + radius + 12}
                        textAnchor="middle"
                        fill="#f1f5f9"
                        fontSize={isCenter ? 12 : 10}
                        fontWeight={isCenter ? 700 : 500}
                      >
                        {node.label.length > 20 ? `${node.label.substring(0, 18)}...` : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* COLOR LEGEND */}
          <div className="graph-legend">
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#0f766e" }} />
              <span>Candidate</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#0284c7" }} />
              <span>Skill</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#7c3aed" }} />
              <span>Employer</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#ea580c" }} />
              <span>Previous Role</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#16a34a" }} />
              <span>Education</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#db2777" }} />
              <span>Location</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#4f46e5" }} />
              <span>Jobs Applied</span>
            </div>
            <div className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: "#dc2626" }} />
              <span>Similar Candidate</span>
            </div>
          </div>
        </div>

        {/* SIDEBAR: NODE INSPECTOR & SIMILAR CANDIDATE MEMORY */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Selected Node Details Card */}
          <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "18px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
              Selected Graph Entity
            </span>
            {selectedNode ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ background: getNodeColor(selectedNode.type), width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {getNodeIcon(selectedNode.type)}
                  </div>
                  <div>
                    <strong style={{ fontSize: "14px", display: "block" }}>{selectedNode.label}</strong>
                    <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "capitalize" }}>
                      Relationship Type: {selectedNode.type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {selectedNode.type === "candidate" && (
                  <div style={{ fontSize: "12px", color: "#475569", marginTop: "10px", lineHeight: "1.5" }}>
                    <div><strong>Title:</strong> {selectedNode.currentTitle as string}</div>
                    <div><strong>Location:</strong> {selectedNode.location as string}</div>
                    <div><strong>Experience:</strong> {selectedNode.experienceYears as number} years</div>
                    <button
                      onClick={() => onSelectCandidate(selectedNode.id)}
                      className="button"
                      style={{ marginTop: "12px", width: "100%", padding: "6px 12px", fontSize: "12px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: "4px" }}
                    >
                      Open Full Dossier
                    </button>
                  </div>
                )}

                {selectedNode.type === "similar_candidate" && (
                  <div style={{ fontSize: "12px", color: "#475569", marginTop: "10px", lineHeight: "1.5" }}>
                    <div style={{ color: "#dc2626", fontWeight: 700, marginBottom: "4px" }}>
                      {selectedNode.similarityScore as number}% Talent Proximity
                    </div>
                    <div><strong>Title:</strong> {selectedNode.currentTitle as string}</div>
                    {Array.isArray(selectedNode.reasons) && selectedNode.reasons.length > 0 && (
                      <div style={{ marginTop: "6px" }}>
                        <strong>Clustering Signals:</strong>
                        <ul style={{ margin: "4px 0 0", paddingLeft: "16px", color: "var(--muted)" }}>
                          {(selectedNode.reasons as string[]).map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <button
                        onClick={() => onSelectCandidate(selectedNode.id)}
                        style={{ flex: 1, padding: "6px 8px", fontSize: "11px", background: "#f1f5f9", border: "1px solid var(--line)", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => onCompare([activeCandidateId, selectedNode.id])}
                        style={{ flex: 1, padding: "6px 8px", fontSize: "11px", background: "#111827", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Compare
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>Click any node on the graph canvas to inspect relational properties.</p>
            )}
          </div>

          {/* Similar Candidates Relational Memory Cluster */}
          <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "8px", padding: "18px", flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <strong style={{ fontSize: "13px" }}>Similar Candidates Memory</strong>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                {graphData?.similarCandidates?.length || 0} matched
              </span>
            </div>
            <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "var(--muted)" }}>
              Candidates in your existing database sharing skill clusters, past employers, or role duration:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {graphData?.similarCandidates?.map((sim) => (
                <div
                  key={sim.candidate.id}
                  style={{
                    padding: "10px 12px",
                    background: "#f8fafc",
                    border: "1px solid var(--line)",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                  onClick={() => setActiveCandidateId(sim.candidate.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--brand)" }}>{sim.candidate.canonicalName}</strong>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>
                      {sim.similarityScore}% match
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                    {sim.candidate.currentTitle || sim.candidate.primaryDomain} • {sim.candidate.location}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {sim.reasons.join(" • ")}
                  </div>
                </div>
              ))}

              {(!graphData?.similarCandidates || graphData.similarCandidates.length === 0) && (
                <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                  No candidate relationships with &ge;25% similarity found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
