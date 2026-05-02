import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, Loader2, ChevronRight,
  Clock, CloudSun, MapPin, ShieldAlert
} from "lucide-react";
import api from "../api/axios";

// ---------------------------------------------------------------------------
// Weather code → label
// ---------------------------------------------------------------------------
const WMO = {
  0:"Clear Sky",1:"Mainly Clear",2:"Partly Cloudy",3:"Overcast",
  45:"Foggy",48:"Icy Fog",51:"Light Drizzle",53:"Drizzle",55:"Heavy Drizzle",
  61:"Light Rain",63:"Rain",65:"Heavy Rain",71:"Light Snow",73:"Snow",
  75:"Heavy Snow",80:"Rain Showers",81:"Showers",82:"Heavy Showers",
  95:"Thunderstorm",99:"Hail Storm",
};
const weatherLabel = (code) => WMO[code] ?? "Clear";

// ---------------------------------------------------------------------------
// Particle canvas — drifting node network
// ---------------------------------------------------------------------------
const ParticleCanvas = () => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let id;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const N = 42;
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.26,
      vy: (Math.random() - 0.5) * 0.26,
      r: Math.random() * 1.5 + 0.5,
    }));
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(220,38,38,${0.13*(1-d/130)})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220,38,38,0.38)";
        ctx.fill();
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <canvas ref={ref} style={{ position:"absolute", inset:0, width:"100%", height:"100%", display:"block" }} />
  );
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
const Login = () => {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [time,     setTime]     = useState(new Date());
  const [weather,  setWeather]  = useState({ temp:"--", condition:"Loading…" });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=24.6833&longitude=46.7333&current_weather=true"
        );
        const d = await r.json();
        setWeather({
          temp: Math.round(d.current_weather.temperature),
          condition: weatherLabel(d.current_weather.weathercode),
        });
      } catch {
        setWeather({ temp:"34", condition:"Sunny" });
      }
    })();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!remember) { setError("Please acknowledge the security protocol to continue."); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("username", email);
      fd.append("password", password);
      const res = await api.post("/auth/login", fd);
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("role",  res.data.role || "staff");
      navigate("/dashboard");
    } catch {
      setError("Invalid credentials. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── LEFT PANEL ANIMATIONS ── */
        @keyframes pulseGlow {
          0%,100% { transform:scale(1);   opacity:.65; }
          50%      { transform:scale(1.22); opacity:1;  }
        }
        @keyframes spinCW  { from { transform:rotate(0deg);   } to { transform:rotate(360deg);  } }
        @keyframes spinCCW { from { transform:rotate(0deg);   } to { transform:rotate(-360deg); } }
        @keyframes floatY  {
          0%,100% { transform:translateY(0px);  }
          50%      { transform:translateY(-11px); }
        }
        @keyframes breathGlow {
          0%,100% { filter:drop-shadow(0 0 10px rgba(220,38,38,0.45)); }
          50%      { filter:drop-shadow(0 0 26px rgba(220,38,38,0.85)); }
        }
        @keyframes blink {
          0%,100% { opacity:1; }
          50%      { opacity:.35; }
        }

        /* ── RIGHT PANEL ANIMATIONS ── */
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes shakeX {
          0%,100% { transform:translateX(0);  }
          20%     { transform:translateX(-6px); }
          40%     { transform:translateX(6px);  }
          60%     { transform:translateX(-4px); }
          80%     { transform:translateX(4px);  }
        }
        @keyframes spinLoader { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

        .fu1 { animation: fadeUp .5s  .05s both ease; }
        .fu2 { animation: fadeUp .5s  .15s both ease; }
        .fu3 { animation: fadeUp .5s  .25s both ease; }
        .fu4 { animation: fadeUp .5s  .35s both ease; }
        .fu5 { animation: fadeUp .5s  .45s both ease; }
        .fu6 { animation: fadeUp .5s  .55s both ease; }

        /* ── INPUT ── */
        .rp-input {
          width:100%; padding:9px 0; background:transparent;
          border:none; border-bottom:1.5px solid #e8ecf0; outline:none;
          font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; color:#0f172a;
          transition:border-color .25s;
        }
        .rp-input::placeholder { color:#c8d0da; font-weight:400; }
        .rp-input:focus { border-color:#dc2626; }
        .rp-field:focus-within .rp-label { color:#dc2626; }
        .rp-label {
          display:block; font-family:'Syne',sans-serif;
          font-size:9px; font-weight:700; letter-spacing:.2em;
          text-transform:uppercase; color:#64748b; margin-bottom:5px; transition:color .2s;
        }

        /* ── SUBMIT BUTTON ── */
        .rp-btn {
          width:100%; padding:15px 22px;
          background:#0f172a; color:#fff; border:none; border-radius:16px;
          display:flex; align-items:center; justify-content:space-between; cursor:pointer;
          font-family:'Syne',sans-serif; font-size:11px; font-weight:700;
          letter-spacing:.22em; text-transform:uppercase;
          transition:background .4s, box-shadow .4s, transform .15s;
          box-shadow:0 4px 20px rgba(15,23,42,.22);
          position:relative; overflow:hidden;
        }
        .rp-btn::before {
          content:''; position:absolute; inset:0;
          background:linear-gradient(135deg,#16a34a,#15803d);
          opacity:0; transition:opacity .4s;
        }
        .rp-btn:hover::before  { opacity:1; }
        .rp-btn:hover { box-shadow:0 6px 28px rgba(22,163,74,.4); transform:translateY(-1px); }
        .rp-btn:active { transform:translateY(0); }
        .rp-btn:disabled { opacity:.6; cursor:not-allowed; transform:none; }
        .rp-btn > * { position:relative; z-index:1; }

        /* ── CHECKBOX ── */
        .rp-ck { width:15px; height:15px; accent-color:#dc2626; cursor:pointer; flex-shrink:0; margin-top:2px; }

        /* ── WIDGET hover ── */
        .rp-widget { transition:background .2s; border-radius:12px; padding:4px 8px; }
        .rp-widget:hover { background:#f1f5f9; }

        /* ── LEFT PANEL responsive ── */
        .lp-panel { display:none; }
        @media (min-width:1024px) { .lp-panel { display:flex !important; } }
      `}</style>

      <div style={{
        display:"flex", minHeight:"100vh", width:"100%",
        fontFamily:"'DM Sans',sans-serif", background:"#f8fafc", overflow:"hidden",
      }}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — perfectly centered cinematic brand hero
        ══════════════════════════════════════════════════════ */}
        <div
          className="lp-panel"
          style={{
            width:"58%", background:"#060a10",
            position:"relative", overflow:"hidden",
            /* PERFECT CENTER — both axes */
            alignItems:"center",
            justifyContent:"center",
          }}
        >
          {/* Particle network */}
          <ParticleCanvas />

          {/* Scanline texture */}
          <div style={{
            position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
            background:"repeating-linear-gradient(to bottom,transparent,transparent 3px,rgba(0,0,0,0.07) 3px,rgba(0,0,0,0.07) 4px)",
          }}/>

          {/* Deep radial glow bg */}
          <div style={{
            position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
            background:"radial-gradient(ellipse 65% 65% at 50% 50%,rgba(110,0,0,0.22) 0%,transparent 70%)",
          }}/>

          {/* Corner brackets */}
          {[
            { top:28,left:28,  borderWidth:"2px 0 0 2px", borderRadius:"5px 0 0 0"   },
            { top:28,right:28, borderWidth:"2px 2px 0 0", borderRadius:"0 5px 0 0"   },
            { bottom:28,left:28,  borderWidth:"0 0 2px 2px", borderRadius:"0 0 0 5px" },
            { bottom:28,right:28, borderWidth:"0 2px 2px 0", borderRadius:"0 0 5px 0" },
          ].map((s, i) => (
            <div key={i} style={{
              position:"absolute", width:40, height:40, zIndex:6,
              borderStyle:"solid", borderColor:"rgba(220,38,38,0.22)", ...s,
            }}/>
          ))}

          {/* ── CENTER COMPOSITION ── */}
          <div style={{
            position:"relative", zIndex:5,
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            /* explicit size so children absolutely positioned rings/glow
               don't push the flex layout — we use relative+absolute here */
            width:320, height:320,
          }}>
            {/* Pulsing radial glow — sits behind everything */}
            <div style={{
              position:"absolute",
              top:"50%", left:"50%",
              transform:"translate(-50%,-50%)",
              width:300, height:300,
              background:"radial-gradient(circle,rgba(220,38,38,0.2) 0%,transparent 68%)",
              borderRadius:"50%",
              animation:"pulseGlow 4s ease-in-out infinite",
              zIndex:1,
            }}/>

            {/* Outer dashed ring */}
            <div style={{
              position:"absolute",
              top:"50%", left:"50%",
              transform:"translate(-50%,-50%)",
              width:300, height:300,
              border:"1px dashed rgba(220,38,38,0.09)",
              borderRadius:"50%",
              animation:"spinCCW 44s linear infinite",
              zIndex:2,
            }}/>

            {/* Inner solid ring with orbit dot */}
            <div style={{
              position:"absolute",
              top:"15%", left:"18%",
              transform:"translate(-50%,-50%)",
              width:220, height:220,
              // border:"1px solid rgba(220,38,38,0.16)",
              border:"2px solid rgba(0, 128, 0, 0.16)",
              borderRadius:"50%",
              animation:"spinCW 28s linear infinite",
              zIndex:3,
            }}>
              {/* Orbit dot */}
              <div style={{
                position:"absolute",
                top:-4, left:"50%",
                transform:"translateX(-50%)",
                width:8, height:8,
                background:"#dc2626",
                borderRadius:"50%",
                boxShadow:"0 0 10px 3px rgba(220,38,38,0.7)",
              }}/>
            </div>

            {/* Floating logo card — dead center */}
            <div style={{
              position:"relative", zIndex:4,
              width:112, height:112,
              background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.09)",
              borderRadius:28,
              display:"flex", alignItems:"center", justifyContent:"center",
              backdropFilter:"blur(14px)",
              boxShadow:"0 0 44px rgba(220,38,38,0.18), inset 0 1px 0 rgba(255,255,255,0.07)",
              animation:"floatY 5s ease-in-out infinite",
            }}>
              <img
                src="/icon-192.png"
                alt="AFAM"
                style={{
                  width:68, height:68, objectFit:"contain",
                  animation:"breathGlow 5s ease-in-out infinite",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextSibling.style.display = "flex";
                }}
              />
              {/* Fallback */}
              <div style={{
                display:"none", alignItems:"center", justifyContent:"center",
                width:68, height:68,
                fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800,
                color:"#dc2626", letterSpacing:".12em",
              }}>
                AFAM
              </div>
            </div>
          </div>

          {/* Brand text — sits below the composition, also centered */}
          <div style={{
            position:"absolute",
            /* place it just below vertical center */
            top:"calc(50% + 172px)",
            left:"50%",
            transform:"translateX(-50%)",
            zIndex:5,
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
            whiteSpace:"nowrap",
          }}>
            <p style={{
              fontFamily:"'Syne',sans-serif", fontSize:10, fontWeight:700,
              letterSpacing:".5em", textTransform:"uppercase",
              color:"#eff7f1",
            }}>
              Human Resource Management Systems
            </p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:1, background:"rgba(220,38,38,0.28)" }}/>
              <p style={{
                fontFamily:"'Syne',sans-serif", fontSize:8.5, fontWeight:700,
                letterSpacing:".4em", color:"#fd695e", textTransform:"uppercase",
              }}>
                Est. 2000
              </p>
              <div style={{ width:32, height:1, background:"rgba(220,38,38,0.28)" }}/>
            </div>
          </div>

        {/* Systems Online chip — bottom center */}
          <div style={{
            position:"absolute", bottom:70, left:"50%", transform:"translateX(-50%)",
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:100, padding:"7px 20px",
            zIndex:6,
          }}>
            <span style={{
              width:6, height:6, borderRadius:"50%",
              background:"#22c55e",
              boxShadow:"0 0 8px rgba(34,197,94,0.8)",
              animation:"blink 2s ease-in-out infinite",
              display:"inline-block",
            }}/>
            <span style={{
              fontFamily:"'Syne',sans-serif", fontSize:8.5, fontWeight:700,
              color:"#f3f6f4", letterSpacing:".28em", textTransform:"uppercase",
            }}>
              Systems Online
            </span>
          </div> {/* <--- Make sure this is closed */}

          <a 
            href="https://shdeepu.github.io/" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              position: "absolute",
              bottom: 45,
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "'Syne', sans-serif",
              fontSize: 7,
              fontWeight: 600,
              color: "#c1baba",
              textDecoration: "none",
              letterSpacing: ".15em",
              textTransform: "uppercase",
              zIndex: 6,
            }}
          >
            Design by Md Sazzad Hossen
          </a>

        </div> {/* This closes the main wrapper container */}

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — refined form
        ══════════════════════════════════════════════════════ */}
        <div style={{
          flex:1, background:"#ffffff",
          display:"flex", flexDirection:"column", justifyContent:"space-between",
          boxShadow:"-24px 0 60px rgba(0,0,0,0.06)", position:"relative",
        }}>
          {/* Top-right accent glow */}
          <div style={{
            position:"absolute", top:-80, right:-80, width:240, height:240,
            background:"radial-gradient(circle,rgba(220,38,38,0.05) 0%,transparent 70%)",
            borderRadius:"50%", pointerEvents:"none",
          }}/>

          {/* Form area */}
          <div style={{
            flex:1, display:"flex", alignItems:"center",
            padding:"44px 52px",
          }}>
            <div style={{ width:"100%", maxWidth:360 }}>

              {/* Logo row */}
              <div className="fu1" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:44 }}>
                <img
                  src="/icon-192.png"
                  alt="AFAM"
                  style={{ height:30, width:"auto", borderRadius:7 }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span style={{
                  fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15,
                  letterSpacing:".28em", color:"#dc2626",
                }}>
                  A F A M
                </span>
              </div>

              {/* Title */}
              <div className="fu2" style={{ marginBottom:28 }}>
                <h1 style={{
                  fontFamily:"'Syne',sans-serif", fontSize:36, fontWeight:300,
                  color:"#0f172a", lineHeight:1, letterSpacing:"-1px", marginBottom:10,
                }}>
                  HRM of{" "}
                  <span style={{ fontWeight:800, color:"#dc2626" }}>AFAM</span>
                </h1>
                <div
                  style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}
                  onClick={() => window.open("https://maps.app.goo.gl/Rv6VnCupQhLZCRNz5","_blank")}
                >
                  <MapPin size={12} color="#ef4444" />
                  <p
                    style={{ fontSize:11, color:"#94a3b8", fontWeight:500, transition:"color .2s" }}
                    onMouseEnter={(e) => (e.target.style.color="#dc2626")}
                    onMouseLeave={(e) => (e.target.style.color="#94a3b8")}
                  >
                    Fatima Al Zahra, Al Malaz, Riyadh 12833, Kingdom of Saudi Arabia.
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display:"flex", alignItems:"flex-start", gap:10,
                  background:"#fff5f5", borderLeft:"3px solid #dc2626",
                  borderRadius:"0 10px 10px 0", padding:"10px 14px", marginBottom:20,
                  animation:"shakeX .4s ease",
                }}>
                  <ShieldAlert size={15} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
                  <p style={{ fontSize:11, fontWeight:600, color:"#b91c1c", lineHeight:1.5 }}>
                    {error}
                  </p>
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:22 }}>

                {/* Email */}
                <div className="rp-field fu3">
                  <label htmlFor="l-email" className="rp-label">Identity</label>
                  <input
                    id="l-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@afamgroup.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rp-input"
                  />
                </div>

                {/* Password */}
                <div className="rp-field fu4" style={{ position:"relative" }}>
                  <label htmlFor="l-pass" className="rp-label">Password</label>
                  <input
                    id="l-pass"
                    type={showPass ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rp-input"
                    style={{ paddingRight:32 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    style={{
                      position:"absolute", right:0, bottom:9,
                      background:"none", border:"none", cursor:"pointer",
                      color:"#cbd5e1", padding:0, display:"flex", alignItems:"center",
                      transition:"color .2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color="#dc2626")}
                    onMouseLeave={(e) => (e.currentTarget.style.color="#5b5353")}
                  >
                    {showPass ? <EyeOff size={20}/> : <Eye size={20}/>}
                  </button>
                </div>

                {/* Checkbox */}
                <div className="fu5" style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <input
                    id="l-ack"
                    type="checkbox"
                    checked={remember}
                    onChange={() => setRemember(!remember)}
                    className="rp-ck"
                  />
                  <label
                    htmlFor="l-ack"
                    style={{
                      fontSize:11, fontWeight:600, lineHeight:1.55,
                      color: remember ? "#475569" : "#94a3b8",
                      cursor:"pointer", transition:"color .2s",
                      fontFamily:"'DM Sans',sans-serif",
                    }}
                  >
                    I acknowledge the security protocol and confirm this is an authorised device.
                  </label>
                </div>

                {/* Submit */}
                <div className="fu6">
                  <button type="submit" disabled={loading} className="rp-btn">
                    <span>{loading ? "Authorizing…" : "Authorize Access"}</span>
                    {loading
                      ? <Loader2 size={18} style={{ animation:"spinLoader 1s linear infinite" }}/>
                      : <ChevronRight size={18}/>
                    }
                  </button>
                </div>

              </form>
            </div>
          </div>

          {/* Footer widgets */}
          <div style={{
            padding:"16px 52px",
            borderTop:"1px solid #f1f5f9",
            display:"grid", gridTemplateColumns:"1fr 1fr", gap:8,
            background:"#fafbfc",
          }}>
            {/* Clock */}
            <div className="rp-widget" style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{
                width:36, height:36, background:"#fff",
                borderRadius:10, border:"1px solid #f1f5f9",
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:"0 1px 4px rgba(0,0,0,0.06)", flexShrink:0,
              }}>
                <Clock size={15} color="#dc2626"/>
              </div>
              <div>
                <p style={{ fontFamily:"'Syne',sans-serif", fontSize:8, fontWeight:700, letterSpacing:".2em", color:"#94a3b8", textTransform:"uppercase" }}>
                  Sync
                </p>
                <p style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:600, color:"#334155", lineHeight:1.3, marginTop:1 }}>
                  {time.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}
                </p>
              </div>
            </div>

            {/* Weather */}
            <div className="rp-widget" style={{
              display:"flex", alignItems:"center", gap:12,
              borderLeft:"1px solid #f1f5f9", paddingLeft:20,
            }}>
              <div style={{
                width:36, height:36, background:"#fff",
                borderRadius:10, border:"1px solid #f1f5f9",
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:"0 1px 4px rgba(0,0,0,0.06)", flexShrink:0,
              }}>
                <CloudSun size={15} color="#f97316"/>
              </div>
              <div>
                <p style={{ fontFamily:"'Syne',sans-serif", fontSize:8, fontWeight:700, letterSpacing:".2em", color:"#94a3b8", textTransform:"uppercase" }}>
                  Riyadh
                </p>
                <p style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:600, color:"#334155", lineHeight:1.3, marginTop:1 }}>
                  {weather.temp}°C &bull; {weather.condition}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Login;














// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, Fingerprint, Clock, CloudSun, ShieldCheck, MapPin } from "lucide-react";
// import api from "../api/axios";

// const Login = () => {
//   const navigate = useNavigate();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPass, setShowPass] = useState(false);
//   const [remember, setRemember] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
  
//   // Live State for Widgets
//   const [time, setTime] = useState(new Date());
//   const [weather, setWeather] = useState({ temp: "--", condition: "Loading..." });

//   // 1. Live Clock Effect
//   useEffect(() => {
//     const timer = setInterval(() => setTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   // 2. Real-time Weather Effect (Riyadh Data)
//   useEffect(() => {
//     const fetchWeather = async () => {
//       try {
//         const response = await fetch(
//           "https://api.open-meteo.com/v1/forecast?latitude=24.6833&longitude=46.7333&current_weather=true"
//         );
//         const data = await response.json();
//         setWeather({
//           temp: Math.round(data.current_weather.temperature),
//           condition: "Clear" 
//         });
//       } catch (err) {
//         setWeather({ temp: "28", condition: "Sunny" }); // Fallback
//       }
//     };
//     fetchWeather();
//   }, []);

//   const handleLogin = async (e) => {
//     e.preventDefault();
//     setError("");
//     if (!remember) {
//       setError("Security protocol acknowledgment required.");
//       return;
//     }
//     setLoading(true);
//     try {
//       const formData = new FormData();
//       formData.append("username", email);
//       formData.append("password", password);
//       const res = await api.post("/auth/login", formData);
//       localStorage.setItem("token", res.data.access_token);
//       localStorage.setItem("role", res.data.role || "staff");
//       navigate("/dashboard");
//     } catch (err) {
//       setError("Access Denied: Invalid Credentials.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="flex min-h-screen w-full bg-[#fafafa] font-sans overflow-hidden">
      
//       {/* --- LEFT SIDE: MOTION VISUAL --- */}
//       <div className="hidden lg:flex relative w-[55%] xl:w-[60%] bg-[#050505] items-center justify-center overflow-hidden">
//         <div className="absolute inset-0 z-0">
//           <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 blur-[100px] rounded-full animate-blob"></div>
//           <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-900/10 blur-[100px] rounded-full animate-blob animation-delay-2000"></div>
//           <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
//         </div>

//         <div className="relative z-10 text-center px-10 max-w-2xl">
//           <div className="relative inline-block mb-12">
//             <div className="absolute -inset-6 border border-white/5 rounded-full animate-[spin_30s_linear_infinite]"></div>
//             <div className="w-32 h-32 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[3rem] flex items-center justify-center relative z-10 animate-float shadow-2xl">
//               <Fingerprint className="w-14 h-14 text-red-600" />
//             </div>
//           </div>
          
//           <h2 className="text-7xl xl:text-9xl font-black text-white italic tracking-tighter leading-none select-none">
//             <span className="text-red-600 not-italic tracking-[0.2em]">AFAM</span>
//           </h2>
//           <p className="mt-6 text-slate-500 font-bold uppercase tracking-[0.6em] text-[10px] opacity-80">
//             Premium Infrastructure &bull; 2026
//           </p>
//         </div>
//       </div>

//       {/* --- RIGHT SIDE: FORM --- */}
//       <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between bg-white relative shadow-[-20px_0_50px_rgba(0,0,0,0.05)]">
        
//         <div className="p-8 sm:p-12 lg:p-16 xl:p-20">
//           <div className="flex items-center justify-between mb-16 lg:mb-20">
//             <div className="flex items-center gap-3">
//               <img 
//                 src="/icon-192.png" 
//                 alt="Logo" 
//                 className="h-8 w-auto rounded shadow-sm"
//               />
//               <span className="font-black text-lg tracking-widest"><span className="text-red-600">A F A M</span></span>
//             </div>
//           </div>

//           <div className="max-w-sm mx-auto lg:mx-0">
//             <h1 className="text-4xl font-light text-slate-900 tracking-tight leading-none mb-4">
//               Access <span className="font-bold text-red-600">Portal</span>
//             </h1>
            
//             {/* Corrected Office Location */}
//             <div className="flex items-center gap-2 text-slate-400 mb-10 group cursor-pointer" 
//                  onClick={() => window.open("https://maps.app.goo.gl/Rv6VnCupQhLZCRNz5", "_blank")}>
//               <MapPin size={14} className="text-red-500" />
//               <p className="text-[11px] font-medium tracking-tight group-hover:text-red-600 transition-colors">
//                 Fatima Al Zahra, Al Malaz, Jarir, Riyadh 12833
//               </p>
//             </div>

//             {error && (
//               <div className="mb-8 p-4 bg-red-50 border-r-4 border-red-600 text-red-700 text-[10px] font-black flex items-center justify-between animate-shake">
//                 {error.toUpperCase()}
//                 <ShieldCheck size={16} />
//               </div>
//             )}

//             <form onSubmit={handleLogin} className="space-y-8">
//               <div className="group relative">
//                 <label className="text-[10px] uppercase tracking-widest font-black text-slate-700 group-focus-within:text-red-600 transition-all">Identity</label>
//                 <input
//                   type="email"
//                   required
//                   placeholder="name@afamgroup.com"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all text-slate-800 font-medium"
//                 />
//               </div>

//               <div className="group relative">
//                 <label className="text-[10px] uppercase tracking-widest font-black text-slate-700 group-focus-within:text-red-600 transition-all">Security Key</label>
//                 <input
//                   type={showPass ? "text" : "password"}
//                   required
//                   placeholder="••••••••"
//                   value={password}
//                   onChange={(e) => setPassword(e.target.value)}
//                   className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all text-slate-800 font-medium"
//                 />
//                 <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-0 bottom-3 text-slate-300 hover:text-red-600">
//                   {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
//                 </button>
//               </div>

//               <div className="flex items-center gap-3 pt-2">
//                 <input 
//                   type="checkbox" 
//                   checked={remember}
//                   onChange={() => setRemember(!remember)}
//                   className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer" 
//                 />
//                 <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Acknowledge Security Protocol</span>
//               </div>

//               <button
//                 type="submit"
//                 disabled={loading}
//                 className="w-full group flex items-center justify-between bg-slate-900 hover:bg-green-600 text-white p-5 rounded-2xl transition-all duration-500 shadow-xl"
//               >
//                 <span className="font-black tracking-[0.2em] text-[11px]">AUTHORIZE ACCESS</span>
//                 {loading ? <Loader2 className="animate-spin w-5 h-5"/> : <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
//               </button>
//             </form>
//           </div>
//         </div>

//         {/* Footer Widgets with Real-Time Data */}
//         <div className="p-8 sm:p-12 border-t border-slate-50 grid grid-cols-2 gap-8 bg-slate-50/50">
//           <div className="flex items-center gap-3">
//             <div className="p-2.5 bg-white shadow-sm rounded-xl"><Clock className="w-4 h-4 text-red-600" /></div>
//             <div>
//               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sync</p>
//               <p className="text-[12px] font-bold text-slate-700 leading-none">
//                 {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
//               </p>
//             </div>
//           </div>
//           <div className="flex items-center gap-3 border-l border-slate-200 pl-8">
//             <div className="p-2.5 bg-white shadow-sm rounded-xl"><CloudSun className="w-4 h-4 text-orange-500" /></div>
//             <div>
//               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Environment</p>
//               <p className="text-[12px] font-bold text-slate-700 leading-none">
//                 {weather.temp}°C &bull; {weather.condition}
//               </p>
//             </div>
//           </div>
//         </div>
//       </div>

//     </div>
//   );
// };

// export default Login;