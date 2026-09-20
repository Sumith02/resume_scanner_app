import { useEffect, useState } from "react";
import { FolderOpen, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "../../api";
import { Alert, Empty, Modal } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { can } from "../../lib/perms";
import type { Candidate, TalentPool } from "../../types";

export function PoolsPage() {
  const { user } = useAuth();
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState<TalentPool | null>(null);

  async function load() {
    try {
      setPools(await api.listPools());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pools");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function open(pool: TalentPool) {
    setActive(await api.getPool(pool.id));
  }

  async function remove(pool: TalentPool) {
    if (!confirm(`Delete pool "${pool.name}"?`)) return;
    await api.deletePool(pool.id);
    await load();
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="page-head">
        <div>
          <h1>Talent Pools</h1>
          <div className="sub">Curated, reusable groups of candidates for future roles.</div>
        </div>
        {can(user, "pool:manage") && (
          <button className="btn primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> New pool
          </button>
        )}
      </div>

      <div className="grid cols-3">
        {pools.map((p) => (
          <div className="card" key={p.id}>
            <div className="flex between">
              <h3>
                <FolderOpen size={15} /> {p.name}
              </h3>
              <span className="pill">{p.member_count} members</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, minHeight: 34 }}>
              {p.description || "No description"}
            </div>
            <div className="flex between mt-2">
              <button className="btn sm ghost" onClick={() => open(p)}>
                Manage
              </button>
              {can(user, "pool:manage") && (
                <button className="icon-btn" onClick={() => remove(p)} title="Delete">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {pools.length === 0 && (
        <div className="card">
          <Empty title="No pools yet" hint="Group candidates into pools to reuse them across searches." />
        </div>
      )}

      {showForm && (
        <PoolModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {active && (
        <PoolMembers
          pool={active}
          onClose={() => setActive(null)}
          onChanged={async () => {
            await load();
            setActive(await api.getPool(active.id));
          }}
        />
      )}
    </>
  );
}

function PoolModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createPool({ name, description: description || undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New talent pool"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !name} onClick={save}>
            Create
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}

function PoolMembers({
  pool,
  onClose,
  onChanged,
}: {
  pool: TalentPool;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listCandidates({ limit: 200 }).then(setCandidates).catch(() => {});
  }, []);

  const members = pool.candidates ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const available = candidates.filter((c) => !memberIds.has(c.id));

  async function add() {
    if (!selected.length) return;
    try {
      await api.addPoolMembers(pool.id, selected);
      setSelected([]);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    }
  }

  async function remove(candidateId: number) {
    await api.removePoolMember(pool.id, candidateId);
    onChanged();
  }

  return (
    <Modal
      wide
      title={`Pool · ${pool.name}`}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Done
        </button>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      <div className="field">
        <label>Add candidates</label>
        <div className="flex" style={{ gap: 8 }}>
          <select
            multiple
            size={6}
            value={selected.map(String)}
            onChange={(e) =>
              setSelected(Array.from(e.target.selectedOptions, (o) => Number(o.value)))
            }
          >
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.current_title || "Candidate"}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!selected.length} onClick={add}>
            <UserPlus size={15} /> Add
          </button>
        </div>
      </div>

      <h3>Members ({members.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Skills</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.current_title || "—"}</td>
                <td>{c.skills.slice(0, 4).join(", ")}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="icon-btn" title="Remove" onClick={() => remove(c.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {members.length === 0 && <Empty title="No members yet" />}
    </Modal>
  );
}
