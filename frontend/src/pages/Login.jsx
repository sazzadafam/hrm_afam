import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, Fingerprint, Clock, CloudSun, ShieldCheck, MapPin } from "lucide-react";
import api from "../api/axios";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Live State for Widgets
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState({ temp: "--", condition: "Loading..." });

  // 1. Live Clock Effect
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Real-time Weather Effect (Riyadh Data)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=24.6833&longitude=46.7333&current_weather=true"
        );
        const data = await response.json();
        setWeather({
          temp: Math.round(data.current_weather.temperature),
          condition: "Clear" 
        });
      } catch (err) {
        setWeather({ temp: "28", condition: "Sunny" }); // Fallback
      }
    };
    fetchWeather();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!remember) {
      setError("Security protocol acknowledgment required.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("username", email);
      formData.append("password", password);
      const res = await api.post("/auth/login", formData);
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("role", res.data.role || "staff");
      navigate("/dashboard");
    } catch (err) {
      setError("Access Denied: Invalid Credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#fafafa] font-sans overflow-hidden">
      
      {/* --- LEFT SIDE: MOTION VISUAL --- */}
      <div className="hidden lg:flex relative w-[55%] xl:w-[60%] bg-[#050505] items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 blur-[100px] rounded-full animate-blob"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-900/10 blur-[100px] rounded-full animate-blob animation-delay-2000"></div>
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
        </div>

        <div className="relative z-10 text-center px-10 max-w-2xl">
          <div className="relative inline-block mb-12">
            <div className="absolute -inset-6 border border-white/5 rounded-full animate-[spin_30s_linear_infinite]"></div>
            <div className="w-32 h-32 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[3rem] flex items-center justify-center relative z-10 animate-float shadow-2xl">
              <Fingerprint className="w-14 h-14 text-red-600" />
            </div>
          </div>
          
          <h2 className="text-7xl xl:text-9xl font-black text-white italic tracking-tighter leading-none select-none">
            <span className="text-red-600 not-italic tracking-[0.2em]">AFAM</span>
          </h2>
          <p className="mt-6 text-slate-500 font-bold uppercase tracking-[0.6em] text-[10px] opacity-80">
            Premium Infrastructure &bull; 2026
          </p>
        </div>
      </div>

      {/* --- RIGHT SIDE: FORM --- */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between bg-white relative shadow-[-20px_0_50px_rgba(0,0,0,0.05)]">
        
        <div className="p-8 sm:p-12 lg:p-16 xl:p-20">
          <div className="flex items-center justify-between mb-16 lg:mb-20">
            <div className="flex items-center gap-3">
              <img 
                src="/icon-192.png" 
                alt="Logo" 
                className="h-8 w-auto rounded shadow-sm"
              />
              <span className="font-black text-lg tracking-widest"><span className="text-red-600">A F A M</span></span>
            </div>
          </div>

          <div className="max-w-sm mx-auto lg:mx-0">
            <h1 className="text-4xl font-light text-slate-900 tracking-tight leading-none mb-4">
              Access <span className="font-bold text-red-600">Portal</span>
            </h1>
            
            {/* Corrected Office Location */}
            <div className="flex items-center gap-2 text-slate-400 mb-10 group cursor-pointer" 
                 onClick={() => window.open("https://maps.app.goo.gl/Rv6VnCupQhLZCRNz5", "_blank")}>
              <MapPin size={14} className="text-red-500" />
              <p className="text-[11px] font-medium tracking-tight group-hover:text-red-600 transition-colors">
                Fatima Al Zahra, Al Malaz, Jarir, Riyadh 12833
              </p>
            </div>

            {error && (
              <div className="mb-8 p-4 bg-red-50 border-r-4 border-red-600 text-red-700 text-[10px] font-black flex items-center justify-between animate-shake">
                {error.toUpperCase()}
                <ShieldCheck size={16} />
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-8">
              <div className="group relative">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-700 group-focus-within:text-red-600 transition-all">Identity</label>
                <input
                  type="email"
                  required
                  placeholder="name@afamgroup.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all text-slate-800 font-medium"
                />
              </div>

              <div className="group relative">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-700 group-focus-within:text-red-600 transition-all">Security Key</label>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all text-slate-800 font-medium"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-0 bottom-3 text-slate-300 hover:text-red-600">
                  {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="checkbox" 
                  checked={remember}
                  onChange={() => setRemember(!remember)}
                  className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer" 
                />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Acknowledge Security Protocol</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full group flex items-center justify-between bg-slate-900 hover:bg-green-600 text-white p-5 rounded-2xl transition-all duration-500 shadow-xl"
              >
                <span className="font-black tracking-[0.2em] text-[11px]">AUTHORIZE ACCESS</span>
                {loading ? <Loader2 className="animate-spin w-5 h-5"/> : <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>
          </div>
        </div>

        {/* Footer Widgets with Real-Time Data */}
        <div className="p-8 sm:p-12 border-t border-slate-50 grid grid-cols-2 gap-8 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white shadow-sm rounded-xl"><Clock className="w-4 h-4 text-red-600" /></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sync</p>
              <p className="text-[12px] font-bold text-slate-700 leading-none">
                {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-l border-slate-200 pl-8">
            <div className="p-2.5 bg-white shadow-sm rounded-xl"><CloudSun className="w-4 h-4 text-orange-500" /></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Environment</p>
              <p className="text-[12px] font-bold text-slate-700 leading-none">
                {weather.temp}°C &bull; {weather.condition}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Login;













//Design 003

// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, Fingerprint, Clock, CloudSun, ShieldCheck } from "lucide-react";
// import api from "../api/axios";

// const Login = () => {
//   const navigate = useNavigate();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPass, setShowPass] = useState(false);
//   const [remember, setRemember] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
//   const [time, setTime] = useState(new Date());

//   useEffect(() => {
//     const timer = setInterval(() => setTime(new Date()), 1000);
//     return () => clearInterval(timer);
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
      
//       {/* --- LEFT SIDE: MOTION VISUAL (Hidden on Mobile) --- */}
//       <div className="hidden lg:flex relative w-[55%] xl:w-[60%] bg-[#050505] items-center justify-center overflow-hidden">
//         {/* Animated Background Mesh */}
//         <div className="absolute inset-0 z-0">
//           <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 blur-[100px] rounded-full animate-blob"></div>
//           <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-900/10 blur-[100px] rounded-full animate-blob animation-delay-2000"></div>
          
//           {/* Subtle Grid */}
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
//             <span className="text-red-600 not-italic">A F A M </span>
//           </h2>
//           <p className="mt-6 text-slate-500 font-bold uppercase tracking-[0.6em] text-[10px] opacity-80">
//             Premium Infrastructure &bull; 2026
//           </p>
//         </div>

//         {/* Branding Corner */}
//         <div className="absolute left-12 bottom-12 flex items-center gap-4">
//             <div className="h-px w-12 bg-slate-800"></div>
//             <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-slate-600">Enterprise Core</p>
//         </div>
//       </div>

//       {/* --- RIGHT SIDE: FORM (Responsive) --- */}
//       <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-between bg-white relative shadow-[-20px_0_50px_rgba(0,0,0,0.05)]">
        
//         {/* Header Section */}
//         <div className="p-8 sm:p-12 lg:p-16 xl:p-20">
//           <div className="flex items-center justify-between mb-16 lg:mb-24">
//             <div className="flex items-center gap-3">
//               <img 
//                 src="/afam.jpg" 
//                 alt="Logo" 
//                 className="h-8 w-auto rounded shadow-sm"
//                 onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=AFAM&background=000&color=fff" }}
//               />
//               <span className="font-black text-lg tracking-tighter"><span className="text-red-600">A F A M </span></span>
//             </div>
            
//             {/* Mobile-Only Clock */}
//             <div className="lg:hidden text-right">
//                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Live</p>
//                 <p className="text-xs font-mono font-bold text-slate-900">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
//             </div>
//           </div>

//           <div className="max-w-sm mx-auto lg:mx-0">
//             <h1 className="text-4xl font-light text-slate-900 tracking-tight leading-none mb-4">
//               Access <span className="font-bold text-red-600">Portal</span>
//             </h1>
//             <p className="text-slate-400 text-sm mb-10">Please authorize your session to continue.</p>

//             {error && (
//               <div className="mb-8 p-4 bg-red-50 border-r-4 border-red-600 text-red-700 text-[10px] font-black flex items-center justify-between animate-shake">
//                 {error.toUpperCase()}
//                 <ShieldCheck size={16} />
//               </div>
//             )}

//             <form onSubmit={handleLogin} className="space-y-8">
//               <div className="group relative">
//                 <label className="text-[10px] uppercase tracking-widest font-black text-slate-300 group-focus-within:text-red-600 transition-all">Work Identity</label>
//                 <input
//                   type="email"
//                   required
//                   placeholder="name@afamgroup.com"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all placeholder:text-slate-200 text-slate-800 font-medium"
//                 />
//               </div>

//               <div className="group relative">
//                 <label className="text-[10px] uppercase tracking-widest font-black text-slate-300 group-focus-within:text-red-600 transition-all">Security Key</label>
//                 <input
//                   type={showPass ? "text" : "password"}
//                   required
//                   placeholder="••••••••"
//                   value={password}
//                   onChange={(e) => setPassword(e.target.value)}
//                   className="w-full py-3 bg-transparent border-b-2 border-slate-100 focus:border-red-600 outline-none transition-all placeholder:text-slate-200 text-slate-800 font-medium"
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
//                 className="w-full group flex items-center justify-between bg-slate-900 hover:bg-red-600 text-white p-5 rounded-2xl transition-all duration-500 shadow-xl hover:shadow-red-200 active:scale-95"
//               >
//                 <span className="font-black tracking-[0.2em] text-[11px]">AUTHORIZE ACCESS</span>
//                 {loading ? <Loader2 className="animate-spin w-5 h-5"/> : <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
//               </button>
//             </form>
//           </div>
//         </div>

//         {/* Footer Widgets (Responsive) */}
//         <div className="p-8 sm:p-12 lg:p-16 border-t border-slate-50 grid grid-cols-2 gap-8 bg-slate-50/50">
//           <div className="flex items-center gap-3">
//             <div className="p-2.5 bg-white shadow-sm rounded-xl"><Clock className="w-4 h-4 text-red-600" /></div>
//             <div>
//               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sync</p>
//               <p className="text-[12px] font-bold text-slate-700 leading-none">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
//             </div>
//           </div>
//           <div className="flex items-center gap-3 border-l border-slate-200 pl-8">
//             <div className="p-2.5 bg-white shadow-sm rounded-xl"><CloudSun className="w-4 h-4 text-orange-500" /></div>
//             <div>
//               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Temperature </p>
//               <p className="text-[12px] font-bold text-slate-700 leading-none">28°C • Clear</p>
//             </div>
//           </div>
//         </div>
//       </div>

//     </div>
//   );
// };

// export default Login;









// //Design 02
// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, Fingerprint, Clock, CloudSun } from "lucide-react";
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

//   useEffect(() => {
//     const timer = setInterval(() => setTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   const handleLogin = async (e) => {
//     e.preventDefault();
//     setError("");
//     if (!remember) {
//       setError("Please acknowledge security protocols.");
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
//       setError("Invalid access credentials.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="flex min-h-screen bg-white font-sans overflow-hidden">
      
//       {/* --- LEFT SIDE: THE FORM --- */}
//       <div className="w-full lg:w-[40%] flex flex-col justify-between p-8 md:p-16 lg:p-20 bg-white z-10 shadow-2xl">
        
//         {/* Top Section: Logo */}
//         <div>
//           <img 
//             src="/afam.jpg" 
//             alt="Logo" 
//             className="h-10 w-auto mb-12 transition-all duration-500 hover:scale-105"
//             onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=AFAM&background=000&color=fff" }}
//           />
//           <h1 className="text-4xl font-light text-slate-900 tracking-tight">
//             System <span className="font-bold text-red-600">Access</span>
//           </h1>
//           <p className="mt-3 text-slate-400 text-sm font-medium italic">AFAM Group Management Ecosystem</p>
//         </div>

//         {/* Middle Section: Form */}
//         <div className="max-w-sm w-full">
//           {error && (
//             <div className="mb-6 p-3 bg-red-50 border-l-2 border-red-600 text-red-700 text-[11px] font-bold animate-shake">
//               {error.toUpperCase()}
//             </div>
//           )}

//           <form onSubmit={handleLogin} className="space-y-6">
//             <div className="group relative">
//               <label className="text-[10px] uppercase tracking-widest font-black text-slate-300 group-focus-within:text-red-600 transition-colors">Identity</label>
//               <input
//                 type="email"
//                 required
//                 placeholder="email@afamgroup.com"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 className="w-full py-3 bg-transparent border-b border-slate-200 focus:border-red-600 outline-none transition-all placeholder:text-slate-200 text-slate-700 text-sm"
//               />
//             </div>

//             <div className="group relative">
//               <label className="text-[10px] uppercase tracking-widest font-black text-slate-300 group-focus-within:text-red-600 transition-colors">Security Key</label>
//               <input
//                 type={showPass ? "text" : "password"}
//                 required
//                 placeholder="••••••••"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 className="w-full py-3 bg-transparent border-b border-slate-200 focus:border-red-600 outline-none transition-all placeholder:text-slate-200 text-slate-700 text-sm"
//               />
//               <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-0 bottom-3 text-slate-300 hover:text-red-600">
//                 {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
//               </button>
//             </div>

//             <div className="flex items-center justify-between">
//               <label className="flex items-center gap-2 cursor-pointer">
//                 <input
//                   type="checkbox"
//                   checked={remember}
//                   onChange={() => setRemember(!remember)}
//                   className="w-3 h-3 border-slate-300 text-red-600 focus:ring-red-600"
//                 />
//                 <span className="text-[11px] text-slate-500 font-bold uppercase tracking-tighter">Acknowledge Policy</span>
//               </label>
//             </div>

//             <button
//               type="submit"
//               disabled={loading}
//               className="w-full group flex items-center justify-center bg-slate-900 hover:bg-red-600 text-white p-4 rounded-xl transition-all duration-300 shadow-lg active:scale-95"
//             >
//               <span className="font-black tracking-[0.2em] text-[10px]">LOGIN TO PORTAL</span>
//               {loading ? <Loader2 className="ml-3 animate-spin w-4 h-4"/> : <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
//             </button>
//           </form>
//         </div>

//         {/* Bottom Section: LIVE WIDGETS */}
//         <div className="flex items-center gap-6 pt-8 border-t border-slate-100">
//           <div className="flex items-center gap-2 text-slate-400">
//             <Clock className="w-4 h-4 text-red-500" />
//             <div className="flex flex-col">
//               <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">System Time</span>
//               <span className="text-xs font-mono font-medium text-slate-600">
//                 {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
//               </span>
//             </div>
//           </div>

//           <div className="flex items-center gap-2 text-slate-400 border-l border-slate-100 pl-6">
//             <CloudSun className="w-4 h-4 text-orange-400" />
//             <div className="flex flex-col">
//               <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Local Environment</span>
//               <span className="text-xs font-medium text-slate-600">28°C • Mostly Sunny</span>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* --- RIGHT SIDE: MOTION --- */}
//       <div className="hidden lg:flex relative w-[60%] bg-[#080808] items-center justify-center overflow-hidden">
//         {/* Moving Background Blobs */}
//         <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-red-600/10 blur-[100px] animate-blob"></div>
//         <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-red-900/10 blur-[100px] animate-blob animation-delay-2000"></div>
        
//         <div className="relative z-10 text-center">
//           <div className="w-24 h-24 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2rem] flex items-center justify-center mx-auto mb-10 animate-float shadow-2xl">
//             <Fingerprint className="w-10 h-10 text-red-600" />
//           </div>
//           <h2 className="text-6xl font-black text-white italic tracking-tighter leading-none">
//             AFAM<span className="text-red-600 not-italic">.</span>
//           </h2>
//           <p className="mt-4 text-slate-500 font-bold uppercase tracking-[0.5em] text-[10px]">Premium Infrastructure</p>
//         </div>

//         {/* Fine Detail Lines */}
//         <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px]"></div>
//       </div>
//     </div>
//   );
// };

// export default Login;








//design 01
// import React, { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Mail, Lock, Eye, EyeOff, Loader2, ChevronRight, Fingerprint } from "lucide-react";
// import api from "../api/axios";

// const Login = () => {
//   const navigate = useNavigate();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPass, setShowPass] = useState(false);
//   const [remember, setRemember] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");

//   const handleLogin = async (e) => {
//     e.preventDefault();
//     setError("");
//     if (!remember) {
//       setError("Please acknowledge security protocols.");
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
//       setError("Invalid access credentials.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="flex min-h-screen bg-white font-sans">
      
//       {/* --- LEFT SIDE: THE FORM --- */}
//       <div className="w-full lg:w-[40%] flex flex-col justify-center px-8 md:px-16 lg:px-24 bg-white z-10">
//         <div className="mb-12">
//           <img 
//             src="/afam.jpg" 
//             alt="Logo" 
//             className="h-12 w-auto mb-8 grayscale hover:grayscale-0 transition-all duration-500"
//             onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=AFAM&background=000&color=fff" }}
//           />
//           <h1 className="text-4xl font-light text-slate-900 tracking-tight">
//             Welcome to <span className="font-bold border-b-4 border-red-600">AFAM</span>
//           </h1>
//           <p className="mt-4 text-slate-500 text-sm">Enter your credentials to access the management ecosystem.</p>
//         </div>

//         {error && (
//           <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-600 text-red-700 text-xs font-medium animate-shake">
//             {error}
//           </div>
//         )}

//         <form onSubmit={handleLogin} className="space-y-6">
//           <div className="space-y-2">
//             <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Work Identity</label>
//             <div className="relative group">
//               <Mail className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-red-600 transition-colors" />
//               <input
//                 type="email"
//                 required
//                 placeholder="email@afamgroup.com"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 className="w-full pl-8 py-3 bg-transparent border-b border-slate-200 focus:border-red-600 outline-none transition-all placeholder:text-slate-300 text-slate-700"
//               />
//             </div>
//           </div>

//           <div className="space-y-2">
//             <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Security Key</label>
//             <div className="relative group">
//               <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-red-600 transition-colors" />
//               <input
//                 type={showPass ? "text" : "password"}
//                 required
//                 placeholder="••••••••"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 className="w-full pl-8 py-3 bg-transparent border-b border-slate-200 focus:border-red-600 outline-none transition-all placeholder:text-slate-300 text-slate-700"
//               />
//               <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
//                 {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
//               </button>
//             </div>
//           </div>

//           <div className="flex items-center justify-between pb-4">
//             <label className="flex items-center gap-2 cursor-pointer group">
//               <input
//                 type="checkbox"
//                 checked={remember}
//                 onChange={() => setRemember(!remember)}
//                 className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600 transition-all"
//               />
//               <span className="text-xs text-slate-500 group-hover:text-slate-900 transition-colors font-medium">Trust this device</span>
//             </label>
//             <button type="button" className="text-xs text-slate-400 hover:text-red-600 transition-colors">Recovery</button>
//           </div>

//           <button
//             type="submit"
//             disabled={loading}
//             className="w-full group relative flex items-center justify-between bg-slate-900 hover:bg-red-600 text-white p-4 rounded-lg transition-all duration-300 overflow-hidden shadow-xl shadow-slate-200 hover:shadow-red-200 active:scale-[0.98]"
//           >
//             <span className="font-bold tracking-widest text-xs ml-2">AUTHENTICATE</span>
//             {loading ? <Loader2 className="animate-spin w-5 h-5 mr-2"/> : <ChevronRight className="group-hover:translate-x-1 transition-transform mr-2" />}
//             {/* Hover Shine Effect */}
//             <div className="absolute inset-0 w-full h-full bg-white/10 -translate-x-full group-hover:animate-shimmer"></div>
//           </button>
//         </form>

//         <p className="mt-20 text-[10px] text-slate-400 uppercase tracking-widest font-medium">
//           Powered by AFAM Core v2.6 &bull; {new Date().getFullYear()}
//         </p>
//       </div>

//       {/* --- RIGHT SIDE: VISUAL MOTION --- */}
//       <div className="hidden lg:flex relative w-[60%] bg-[#0a0a0a] items-center justify-center overflow-hidden">
        
//         {/* Animated Background Motion */}
//         <div className="absolute inset-0 z-0">
//           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/20 blur-[120px] rounded-full animate-blob"></div>
//           <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-500/10 blur-[120px] rounded-full animate-blob animation-delay-2000"></div>
//         </div>

//         {/* Content Over Visual */}
//         <div className="relative z-10 text-center p-12">
//           <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 mb-8 animate-float">
//             <Fingerprint className="w-12 h-12 text-red-500" />
//           </div>
//           <h2 className="text-5xl font-bold text-white mb-6 leading-tight">
//             Precision in <br /> 
//             <span className="text-red-600">Retail & Dining.</span>
//           </h2>
//           <div className="flex gap-4 justify-center">
//             {["Premium Markets", "Refined Dining", "Expert Staffing"].map((item) => (
//               <span key={item} className="px-4 py-1.5 rounded-full border border-white/10 text-[10px] uppercase tracking-widest text-slate-400 bg-white/5">
//                 {item}
//               </span>
//             ))}
//           </div>
//         </div>

//         {/* Branding Watermark */}
//         <div className="absolute bottom-12 right-12 opacity-20">
//            <h3 className="text-white text-8xl font-black italic select-none">AFAM</h3>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Login;











// import React, { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
// import api from "../api/axios";

// const Login = () => {
//   const navigate = useNavigate();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPass, setShowPass] = useState(false);
//   const [remember, setRemember] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");

//   const handleLogin = async (e) => {
//     e.preventDefault();
//     setError("");

//     if (!remember) {
//       setError("Please check 'Remember me' to acknowledge access terms.");
//       return;
//     }

//     setLoading(true);
//     const formData = new FormData();
//     formData.append("username", email);
//     formData.append("password", password);

//     try {
//       const res = await api.post("/auth/login", formData);
      
//       // 1. Save the token for API requests
//       localStorage.setItem("token", res.data.access_token);
      
//       // 2. Save the user role (This powers the Read-Only logic we added to Sidebar/Tables)
//       // Note: Adjust 'res.data.role' if your backend nests the role differently (e.g., res.data.user.role)
//       const role = res.data.role || "staff"; 
//       localStorage.setItem("role", role);

//       // 3. Optional: Save user info for the dashboard header
//       if (res.data.name) localStorage.setItem("userName", res.data.name);

//       // Redirect to main dashboard
//       navigate("/dashboard");
//     } catch (err) {
//       console.error("Login Error:", err);
//       setError(
//         err.response?.status === 401
//           ? "Incorrect email or password"
//           : "Backend connection lost. Try again later."
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="relative min-h-screen flex items-center justify-center bg-[#0f172a] overflow-hidden">
      
//       {/* GRADIENT MESH */}
//       <div className="absolute inset-0">
//         <div className="absolute w-[700px] h-[700px] bg-red-600/10 blur-[160px] rounded-full -top-40 -left-40 animate-pulse"></div>
//         <div className="absolute w-[600px] h-[600px] bg-emerald-600/10 blur-[160px] rounded-full bottom-[-200px] right-[-100px] animate-pulse delay-700"></div>
//       </div>

//       <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:40px_40px]"></div>

//       <div className="group perspective-1000">
//         <div className="relative w-[420px] p-[1px] rounded-3xl bg-gradient-to-br from-red-500 via-slate-500 to-emerald-500 shadow-2xl">
//           <div className="backdrop-blur-2xl bg-slate-900/90 border border-white/5 rounded-3xl p-10">
            
//             {/* LOGO SECTION */}
//             <div className="flex justify-center mb-8 relative">
//               <div className="absolute w-24 h-24 border border-red-500/20 rounded-full animate-spin"></div>
//               <div className="w-20 h-20 bg-white rounded-2xl shadow-xl z-10 overflow-hidden flex items-center justify-center border border-slate-200">
//                 <img 
//                   src="/afam.jpg" 
//                   alt="AFAM Group" 
//                   className="w-full h-full object-contain p-1"
//                   onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=AFAM&background=ef4444&color=fff" }}
//                 />
//               </div>
//             </div>

//             <h1 className="text-3xl font-bold text-white text-center mb-2"> 
//               <span className="text-[#ef4444]">AFAM</span> Group 
//             </h1>

//             <p className="text-slate-400 text-[11px] leading-relaxed text-center mb-8 uppercase tracking-tighter opacity-80">
//               Premium retail • fresh markets • refined dining
//             </p>

//             {error && (
//               <div className="mb-6 text-red-400 text-[12px] bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-center">
//                 {error}
//               </div>
//             )}

//             <form onSubmit={handleLogin} className="space-y-5">
//               <div className="relative">
//                 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
//                 <input
//                   type="email"
//                   required
//                   placeholder="Work email"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-red-500/50 outline-none transition-all placeholder:text-slate-600"
//                 />
//               </div>

//               <div className="relative">
//                 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
//                 <input
//                   type={showPass ? "text" : "password"}
//                   required
//                   placeholder="Password"
//                   value={password}
//                   onChange={(e) => setPassword(e.target.value)}
//                   className="w-full pl-11 pr-10 py-3 bg-slate-800/50 border border-slate-700 text-white rounded-xl focus:ring-1 focus:ring-red-500/50 outline-none transition-all placeholder:text-slate-600"
//                 />
//                 <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
//                   {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
//                 </button>
//               </div>

//               <div className="flex justify-between items-center text-[13px]">
//                 <label className="flex items-center gap-2 text-slate-400 cursor-pointer group">
//                   <input
//                     type="checkbox"
//                     checked={remember}
//                     onChange={() => setRemember(!remember)}
//                     className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 accent-red-500"
//                   />
//                   <span className={remember ? "text-red-400" : "group-hover:text-slate-300"}>
//                     Remember me
//                   </span>
//                 </label>
//                 <button type="button" className="text-slate-500 hover:text-red-400 transition-colors">Forgot?</button>
//               </div>

//               <button
//                 type="submit"
//                 disabled={loading}
//                 className="group relative w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 font-bold text-white flex items-center justify-center transition shadow-lg shadow-red-900/20 active:scale-[0.98]"
//               >
//                 {loading ? <Loader2 className="animate-spin w-5 h-5"/> : (
//                   <div className="flex items-center gap-2">
//                     Sign In <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/>
//                   </div>
//                 )}
//               </button>
//             </form>

//             <p className="mt-10 text-center text-slate-600 text-[10px] tracking-[0.2em] uppercase font-medium">
//               &copy; 2026 AFAM Group &bull; Developed by Sazzad 
//             </p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Login;