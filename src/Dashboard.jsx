import { useState, useEffect } from 'react';
import { solveGPICWithGLPK } from './lpSolver';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Dashboard() {
  // State
  const [mi, setMi] = useState(0);
  const [aP, setAP] = useState(325);
  const [mP, setMP] = useState(250);
  const [uP, setUP] = useState(400);
  const [gP, setGP] = useState(5);
  const [mxA, setMxA] = useState(1320);
  const [mxM, setMxM] = useState(1250);
  const [mxU, setMxU] = useState(2150);
  const [mxG, setMxG] = useState(128);
  const [solving, setSolving] = useState(false);
  const [solverStatus, setSolverStatus] = useState('Ready');
  const [tab, setTab] = useState('optimizer');
  const [result, setResult] = useState(null);

  const days = DAYS_IN_MONTH[mi];

  // Solve when inputs change
  useEffect(() => {
    setSolving(true);
    setSolverStatus('Solving...');
    
    solveGPICWithGLPK(aP, mP, uP, gP, mxA, mxM, mxU, mxG, days)
      .then(solution => {
        setResult(solution);
        setSolverStatus(`✓ ${solution.solverStatus}`);
        setSolving(false);
      })
      .catch(error => {
        console.error('Solver error:', error);
        setSolverStatus('✗ Error');
        setSolving(false);
      });
  }, [aP, mP, uP, gP, mxA, mxM, mxU, mxG, days]);

  if (!result) {
    return (
      <div style={{
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>GPIC Optimizer</h1>
        <p style={{ color: '#94a3b8' }}>Loading GLPK solver...</p>
      </div>
    );
  }

  // Formatting helpers
  const fM = (val) => `$${(val / 1e6).toFixed(2)}M`;
  const ff = (val, dec = 1) => val.toFixed(dec);
  const pc = result.profit >= 0 ? '#22c55e' : '#ef4444';
  const mn = { fontFamily: 'monospace' };

  // Calculations
  const vcA = (result.va || 0) * (result.K11 || 0);
  const vcMt = (result.vm || 0) * (result.D5 || 0);
  const vcU = (result.vu || 0) * (result.K9 || 0);
  const rA = (aP || 0) * (result.K11 || 0);
  const rMt = (mP || 0) * (result.D5 || 0);
  const rU = (uP || 0) * (result.K9 || 0);

  // Components
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 };

  const Card = ({ t, children }) => (
    <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(100,120,150,0.1)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</div>
      {children}
    </div>
  );

  const KPI = ({ t, v, s, co, b }) => (
    <div style={{ background: `${co || '#0f172a'}20`, border: `1px solid ${co || '#0f172a'}40`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>{t}</div>
      <div style={{ fontSize: 18, fontWeight: b ? 800 : 700, color: co || '#e2e8f0' }}>{v}</div>
      <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{s}</div>
    </div>
  );

  return (
    <div style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
            GPIC Profitability Optimizer
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
            Simplex LP Solver with GLPK.js
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
            Status: {solverStatus} {solving && '⏳'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid rgba(100,120,150,0.1)', paddingBottom: 12 }}>
          {[
            { id: 'optimizer', label: 'Optimizer' },
            { id: 'inputs', label: 'Inputs' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'rgba(59,130,246,0.2)' : 'transparent',
                border: tab === t.id ? '1px solid rgba(59,130,246,0.4)' : 'none',
                color: tab === t.id ? '#60a5fa' : '#64748b',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'inputs' && (
          <Card t="Market & Operating Parameters">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <label style={lb}>Ammonia $/MT</label>
                <input value={aP} onChange={e => setAP(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Methanol $/MT</label>
                <input value={mP} onChange={e => setMP(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Urea $/MT</label>
                <input value={uP} onChange={e => setUP(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Gas Price $/MMBTU</label>
                <input value={gP} onChange={e => setGP(+e.target.value)} type="number" step="0.1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Ammonia MT/D</label>
                <input value={mxA} onChange={e => setMxA(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Methanol MT/D</label>
                <input value={mxM} onChange={e => setMxM(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Urea MT/D</label>
                <input value={mxU} onChange={e => setMxU(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Gas Limit MMSCFD</label>
                <input value={mxG} onChange={e => setMxG(+e.target.value)} type="number" step="1" style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lb}>Month ({days}d)</label>
                <select value={mi} onChange={e => setMi(+e.target.value)} style={{ width: '100%', background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(100,120,150,0.15)', borderRadius: 6, color: '#e2e8f0', padding: 8, fontSize: 12, boxSizing: 'border-box' }}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
            </div>
          </Card>
        )}

        {tab === 'optimizer' && (
          <>
            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
              <KPI t="Net Monthly Profit" v={fM(result.profit)} s={`Case ${result.caseId} • ${MONTH_NAMES[mi]}`} co={pc} b />
              <KPI t="Ammonia" v={`${ff(result.dA, 1)} MT/D`} s={`${ff(result.K11, 0)} saleable/mo`} co="#f59e0b" />
              <KPI t="Methanol" v={`${ff(result.dM, 1)} MT/D`} s={`${ff(result.D5, 0)}/mo`} co="#a855f7" />
              <KPI t="Urea" v={`${ff(result.dU, 1)} MT/D`} s={`${ff(result.K9, 0)}/mo`} co="#22c55e" />
              <KPI t="Gas" v={`${ff(result.gas, 2)} MMSCFD`} s={`${ff((result.gas / mxG) * 100, 1)}% of limit`} co="#ef4444" />
            </div>

            {/* Revenue Analysis */}
            <Card t="Revenue & Cost Analysis">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(100,120,150,0.15)' }}>
                    {['Product', 'Volume (MT/mo)', 'Price', 'Revenue', 'VC/MT', 'Total VC', 'Margin', 'Contribution'].map((h, i) => (
                      <th key={i} style={{ padding: 10, textAlign: i === 0 ? 'left' : 'right', color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Ammonia', vol: result.K11, price: aP, vc: result.va, c: '#f59e0b' },
                    { name: 'Methanol', vol: result.D5, price: mP, vc: result.vm, c: '#a855f7' },
                    { name: 'Urea', vol: result.K9, price: uP, vc: result.vu, c: '#22c55e' }
                  ].map((x, i) => {
                    const cm = x.price - x.vc;
                    const rev = x.vol * x.price;
                    const vc_t = x.vol * x.vc;
                    const contrib = cm * x.vol;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(100,120,150,0.08)' }}>
                        <td style={{ padding: 10, color: x.c, fontWeight: 600 }}>{x.name}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn }}>{ff(x.vol, 0)}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn }}>${x.price}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn, color: '#22c55e', fontWeight: 700 }}>{fM(rev)}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn }}>${ff(x.vc, 2)}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn, color: '#f87171' }}>{fM(vc_t)}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn, color: cm >= 0 ? '#22c55e' : '#ef4444' }}>${ff(cm, 2)}</td>
                        <td style={{ textAlign: 'right', padding: 10, ...mn, color: contrib >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fM(contrib)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Technical Details */}
            <Card t="Technical Details">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 11 }}>
                <div>
                  <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Ammonia Production</div>
                  <div style={mn}>K10_A: {ff(result.K10_A, 0)} MT/mo</div>
                  <div style={mn}>K10_B: {ff(result.K10_B, 0)} MT/mo</div>
                  <div style={mn}>K11 (saleable): {ff(result.K11, 0)} MT/mo</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Urea Production</div>
                  <div style={mn}>K9_A: {ff(result.K9_A, 0)} MT/mo</div>
                  <div style={mn}>K9_B: {ff(result.K9_B, 0)} MT/mo</div>
                  <div style={mn}>K9 (total): {ff(result.K9, 0)} MT/mo</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Capacity Utilization</div>
                  <div style={mn}>Ammonia: {ff((result.K10_A + result.K10_B) / (mxA * days) * 100, 1)}%</div>
                  <div style={mn}>Methanol: {ff((result.D5) / (mxM * days) * 100, 1)}%</div>
                  <div style={mn}>Urea: {ff((result.K9) / (mxU * days) * 100, 1)}%</div>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid rgba(100,120,150,0.08)', textAlign: 'center', fontSize: 10, color: '#334155', letterSpacing: 0.5 }}>
          GPIC LP PROFITABILITY OPTIMIZER • SIMPLEX WITH GLPK.JS • GUARANTEED OPTIMAL SOLUTIONS
        </div>
      </div>
    </div>
  );
}
