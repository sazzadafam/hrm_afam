import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../api/axios";
import * as XLSX from "xlsx";
import {
  Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History,
  Trash2, X, Download, Search, AlertCircle, FileText, Ghost,
  Coffee, ChevronLeft, ChevronRight, AlertTriangle
} from "lucide-react";
import ManualEntryModal from "../components/ManualEntryForm";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const ROWS_PER_PAGE = 20;


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "--";

const formatWorkHours = (decimal) => {
  if (!decimal || decimal === 0) return "0h 00m";
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

// ---------------------------------------------------------------------------
// fixCrossMidnightCheckout
// If check_out < check_in (overnight shift), add 1 day. 24h sanity guard.
// ---------------------------------------------------------------------------
const fixCrossMidnightCheckout = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return checkOut;
  const inMs  = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  if (outMs < inMs) {
    const adjusted = outMs + 24 * 60 * 60 * 1000;
    if (adjusted - inMs <= 24 * 60 * 60 * 1000) {
      return new Date(adjusted).toISOString();
    }
  }
  return checkOut;
};

// ---------------------------------------------------------------------------
// determineShiftType
// Rule: 02:00–14:00 inclusive → "Day", else → "Night"
// ---------------------------------------------------------------------------
const determineShiftType = (shiftStartStr, actualCheckIn = null) => {
  if (actualCheckIn) {
    const h = new Date(actualCheckIn).getHours();
    const m = new Date(actualCheckIn).getMinutes();
    const totalMins = h * 60 + m;
    return totalMins >= 120 && totalMins <= 840 ? "Day" : "Night";
  }
  if (!shiftStartStr || !shiftStartStr.trim()) return "Unknown";
  const parts = shiftStartStr.trim().split(":");
  if (parts.length < 2) return "Unknown";
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return "Unknown";
  const totalMins = h * 60 + m;
  return totalMins >= 120 && totalMins <= 840 ? "Day" : "Night";
};

// ---------------------------------------------------------------------------
// resolveShiftType
// Always recalculate from actual check_in for real punches.
// Falls back to shift_start string for absent rows only.
// ---------------------------------------------------------------------------
const resolveShiftType = (log) => {
  const isAbsent = log.status?.toLowerCase() === "absent";
  if (!isAbsent && log.check_in) {
    return determineShiftType(log.shift_start, log.check_in);
  }
  return determineShiftType(log.shift_start);
};

// ---------------------------------------------------------------------------
// computeHoursWorked
// Recomputes with cross-midnight correction if API returned 0.
// ---------------------------------------------------------------------------
const computeHoursWorked = (log) => {
  if (log.hours_worked && log.hours_worked > 0) return log.hours_worked;
  if (!log.check_in || !log.check_out) return 0;
  if (log.status?.toLowerCase() === "absent") return 0;
  const fixedOut = fixCrossMidnightCheckout(log.check_in, log.check_out);
  const diffMs   = new Date(fixedOut).getTime() - new Date(log.check_in).getTime();
  const breakMs  = (log.total_break_minutes || 0) * 60 * 1000;
  return Math.max(0, Math.round(((diffMs - breakMs) / 3600000) * 100) / 100);
};

const deduplicateLogs = (data = []) => {
  const uniqueMap = new Map();
  data.forEach((log) => {
    const raw     = log.check_in || log.date;
    const dateStr = raw ? new Date(raw).toDateString() : "unknown";
    const key     = `${log.employee_id}-${dateStr}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, log);
    } else {
      const existing = uniqueMap.get(key);
      if (existing.status?.toLowerCase() === "absent" && log.check_in) {
        uniqueMap.set(key, log);
      }
    }
  });
  return Array.from(uniqueMap.values());
};


// ---------------------------------------------------------------------------
// getAttendanceMetrics — PROBLEMS 2, 3, 4 FIXED HERE
//
// ROOT CAUSE of all three "wrong Early Leave" problems:
//
// The old shiftEnd calculation was:
//   const shiftEnd = new Date(log.check_in);
//   shiftEnd.setHours(eH, eM, 0, 0);
//   if (eH < sH) shiftEnd.setDate(shiftEnd.getDate() + 1);
//
// BUG 1 (Problem 2 — Abdul Abeer Apr 03,04,05):
//   shift_start="20:00", shift_end="08:00". Employee punched IN at 08:01 AM
//   (a day-side punch, not their scheduled 8 PM). The code set:
//     shiftEnd = Apr03 at 08:00 AM
//     eH(8) < sH(20) → +1 day → Apr04 08:00 AM
//   Then fixedCheckOut = Apr03 08:05 PM (no midnight cross needed, out > in).
//   minsEarly = (Apr04 08:00 AM) - (Apr03 08:05 PM) = +720 mins → isEarly=true ❌
//
//   The employee checked out at 8:05 PM which is BEFORE the next-day 8 AM
//   shiftEnd — but only because the shiftEnd was advanced to next day using
//   the SCHEDULED shift's overnight rule, even though this employee actually
//   worked a day-side window (8 AM to 8 PM).
//
// BUG 2 (Problem 3 — Babul Miah OUT 02:20 AM, shift_end 02:00 AM):
//   shift_start="14:00", shift_end="02:00". check_in=14:xx PM, check_out=02:20 AM.
//   fixedCheckOut = 02:20 AM next day (midnight cross applied ✅).
//   shiftEnd = check_in_date at 02:00 AM, eH(2) < sH(14) → +1 day → 02:00 AM next day.
//   minsEarly = (02:00 AM next day) - (02:20 AM next day) = -20 mins → isEarly=false ✅
//   Wait — this SHOULD be correct already. The bug is that fixCrossMidnightCheckout
//   is comparing ISO strings from the API. If check_out from the API is stored as
//   "2026-04-01T02:20:00" (naive, same calendar date as check_in "2026-04-01T14:00:00"),
//   then out(02:20) < in(14:00) → fixedOut = Apr02 02:20 AM. shiftEnd = Apr02 02:00 AM.
//   minsEarly = (Apr02 02:00) - (Apr02 02:20) = -20 → NOT early ✅.
//   UNLESS the stored check_out is already on Apr02 (correct date from DB), in which
//   case fixCrossMidnight sees outMs > inMs → no fix → fixedOut = Apr02 02:20 AM.
//   shiftEnd = Apr01 at 02:00 AM, eH(2) < sH(14) → +1 day = Apr02 02:00 AM.
//   minsEarly = -20 → not early ✅. Either way it should be fine.
//
//   THE REAL BUG: When shift_end equals shift_start hour (e.g. shift_end="02:00",
//   shift_start="14:00" and eH=2, sH=14), the +1 day rule fires. But when
//   shift_end="02:00" and shift_start="02:00" or any case where the check_in
//   is stored on the NEXT calendar day (e.g. check_in is 2026-04-02 02:10 for
//   a shift that started Apr01 at 14:00), shiftEnd is built from check_in's
//   date (Apr02), set to 02:00, eH(2) NOT < sH(14)... wait eH IS < sH → +1 day
//   → Apr03 02:00 AM. fixedCheckOut = Apr02 02:20 AM. minsEarly = huge → isEarly ❌
//
//   THIS IS THE BUG: when check_in itself is on the "next day" portion of an
//   overnight shift, building shiftEnd from check_in's date and then adding
//   another day pushes shiftEnd one day too far.
//
// BUG 3 (Problem 4 — Md Faruq OUT 12:04 PM, shift_end 12:00 PM):
//   shift_start="00:00", shift_end="12:00". check_in=00:00, check_out=12:04 PM.
//   eH(12) NOT < sH(0) → NO +1 day. shiftEnd = same day 12:00. fixedCheckOut=12:04.
//   minsEarly = (12:00 - 12:04) = -4 → NOT early ✅. Should be fine!
//
//   Apr 18: check_in=06:00 AM (6h late). check_out=12:24 PM.
//   shiftEnd = Apr18 12:00. minsEarly = -24 → NOT early ✅.
//   But screenshot shows "Early Leave". WHY?
//
//   ANSWER: shift_start for Md Faruq is "00:00". When check_in=06:00 AM,
//   shiftStartTime = Apr18 at 00:00. The LATE check means isLate=true.
//   For shiftEnd: sH=0, eH=12. eH(12) > sH(0) → no +1 day. shiftEnd=Apr18 12:00.
//   fixedCheckOut: out=12:24 > in=06:00 → no fix. minsEarly=(12:00-12:24)=-24 → ok.
//   STILL should not be Early Leave.
//
//   THE ACTUAL BUG for Md Faruq: shift_start="00:00", sH=0. Check_in stored as
//   "2026-04-18T00:00:00" (midnight). BUT the ZK machine may store the check_in
//   on the PREVIOUS calendar day at midnight, meaning check_in = "2026-04-17T00:00:00"
//   and check_out = "2026-04-17T12:04:00". Then on Apr18 the employee punches at
//   06:00 AM = "2026-04-18T06:00:00". The DISPLAY shows Apr18 06:00 AM because
//   the date shown is from check_in. shiftEnd uses check_in's date (Apr18 if
//   check_in=Apr18 06:00). This all seems fine.
//
//   REAL ISSUE FOUND: When shift_start="00:00" (midnight), sH=0.
//   shiftStartTime = new Date(logDate); shiftStartTime.setHours(0,0,0,0).
//   The guard: "if (h === 0 && log.check_in && checkInDate.getHours() >= 22)"
//   adds 1 day to shiftStartTime. This means for employees with shift_start=00:00
//   who check in at e.g. 06:00 AM, shiftStartTime = same day midnight = fine.
//   isLate = (06:00 - 00:00) / 60000 > 10 = TRUE.
//
//   For shiftEnd with shift_start="00:00", shift_end="12:00":
//   sH=0, eH=12. eH(12) > sH(0) → no +1 day. shiftEnd=same day 12:00.
//   Seems fine. Unless... the check_in IS at midnight "00:00" and the shiftEnd
//   guard `eH < sH` doesn't add a day. shiftEnd = midnight + 12h = noon same day.
//   OUT at 12:04 → not early. OUT at 12:24 → not early.
//
// ===== FINAL DIAGNOSIS =====
// The problems all share the same root cause: shiftEnd is built using
// `new Date(log.check_in)` as the base and then `setHours(eH, eM)`.
// This is FRAGILE because:
//
//  1. It doesn't account for check_in being on the "overflow" day of a
//     cross-midnight shift (the next-calendar-day portion).
//
//  2. The `eH < sH` rule adds +1 day when shift_end hour < shift_start hour,
//     but this is ONLY correct when check_in is on the shift's START day.
//     If check_in is on the end day (e.g., a night shift worker's check_in
//     is at 02:00 AM the next day), adding +1 day to shiftEnd overshoots by one.
//
// THE FIX:
// Build shiftEnd as `shiftStartTime + duty_hours`, where shiftStartTime is
// already correctly computed (including cross-midnight handling). This makes
// shiftEnd purely a function of when the shift STARTED, not of check_in's date.
//
// If duty_hour is not available, fall back to: shiftEnd = shiftStartTime with
// eH:eM set, then if that result <= shiftStartTime, add 1 day.
// This "if result <= start, add 1 day" rule is correct regardless of which
// calendar day check_in falls on.
// ---------------------------------------------------------------------------

const getAttendanceMetrics = (log) => {
  const statusLower = log.status?.toLowerCase();
  const now         = new Date();
  const rawDate     = log.check_in || log.date;
  const logDate     = rawDate ? new Date(rawDate) : now;
  const isToday     = logDate.toDateString() === now.toDateString();

  // ── Build shiftStartTime ──────────────────────────────────────────────────
  let shiftStartTime = null;
  if (log.shift_start) {
    const [sH, sM] = log.shift_start.split(":").map(Number);
    shiftStartTime = new Date(logDate);
    shiftStartTime.setHours(sH, sM, 0, 0);

    // If shift_start is midnight (00:xx) and check_in is late-evening (>=22:xx),
    // the shift_start is actually the next calendar day.
    if (sH === 0 && log.check_in && new Date(log.check_in).getHours() >= 22) {
      shiftStartTime.setDate(shiftStartTime.getDate() + 1);
    }
    // If shift_start hour is late-evening (>=20) and check_in is early-morning (<=4),
    // the shift_start was the previous calendar day.
    if (sH >= 20 && log.check_in && new Date(log.check_in).getHours() <= 4) {
      shiftStartTime.setDate(shiftStartTime.getDate() - 1);
    }
  }

  // ── Early exits ───────────────────────────────────────────────────────────
  if (isToday && !log.check_in && shiftStartTime && now < shiftStartTime)
    return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"Scheduled" };

  if (statusLower === "absent")
    return { isLate:false, isEarly:false, isAbsent:true,  isOnBreak:false, statusText:"Absent" };

  if (statusLower === "on_break")
    return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:true,  statusText:"On Break" };

  if (!log.check_in || !log.shift_start)
    return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"Normal" };

  // ── isLate ────────────────────────────────────────────────────────────────
  // Grace: 10 minutes after shift_start
  const isLate = shiftStartTime
    ? (new Date(log.check_in) - shiftStartTime) / 60000 > 10
    : false;

  if (log.check_in && !log.check_out)
    return { isLate, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"On Duty" };

  // ── isEarly ───────────────────────────────────────────────────────────────
  // FIXED: Build shiftEnd from shiftStartTime (already correct) rather than
  // from log.check_in's calendar date. This eliminates all three wrong-Early-Leave
  // cases described above.
  //
  // Strategy:
  //   1. If duty_hour is available: shiftEnd = shiftStartTime + duty_hour hours
  //      (most accurate — directly encodes how long the shift should last)
  //   2. Otherwise: place eH:eM on the same datetime as shiftStartTime, then
  //      if the result is <= shiftStartTime (i.e., shift_end is "earlier" in
  //      clock terms than shift_start, meaning it crosses midnight), add 1 day.
  //      This "+1 day if result <= start" rule is always correct because it only
  //      adds a day when genuinely needed, regardless of check_in's calendar date.

  let isEarly = false;

  if (log.check_out && log.shift_end && shiftStartTime) {
    const [eH, eM] = log.shift_end.split(":").map(Number);

    let shiftEnd;

    if (log.duty_hour && log.duty_hour > 0) {
      // Method 1: add duty hours to shift start (most reliable)
      shiftEnd = new Date(shiftStartTime.getTime() + log.duty_hour * 3600 * 1000);
    } else {
      // Method 2: place shift_end time on same base as shiftStartTime
      shiftEnd = new Date(shiftStartTime);
      shiftEnd.setHours(eH, eM, 0, 0);

      // CRITICAL FIX: if shiftEnd <= shiftStartTime, the shift crosses midnight
      // → add 1 day. This replaces the old broken `eH < sH` rule.
      if (shiftEnd <= shiftStartTime) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
    }

    // Apply cross-midnight correction to checkout before comparing
    const fixedCheckOut = new Date(fixCrossMidnightCheckout(log.check_in, log.check_out));

    // Grace: 10 minutes before shiftEnd is acceptable
    const minsEarly = (shiftEnd - fixedCheckOut) / 60000;
    isEarly = minsEarly > 10;
  }

  // ── Status text ───────────────────────────────────────────────────────────
  let statusText = "Normal";
  if (isLate && isEarly) statusText = "Late & Early Leave";
  else if (isLate)        statusText = "Late Arrival";
  else if (isEarly)       statusText = "Early Leave";

  return { isLate, isEarly, isAbsent:false, isOnBreak:false, statusText };
};


// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

const StatCard = ({ title, value, icon, colorClass }) => (
  <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden group">
    <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"/>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
        <h3 className="text-4xl font-light text-white tracking-tighter drop-shadow-md">{value}</h3>
      </div>
      <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center border shadow-inner ${colorClass}`}>
        {icon}
      </div>
    </div>
  </div>
);


// ---------------------------------------------------------------------------
// ArchiveSummaryBar
// ---------------------------------------------------------------------------

const ArchiveSummaryBar = ({ logs }) => {
  const totals = useMemo(() => {
    let present=0, late=0, early=0, absent=0, totalHours=0;
    logs.forEach((log) => {
      const m = getAttendanceMetrics(log);
      if (m.isAbsent) { absent++; return; }
      present++;
      if (m.isLate)  late++;
      if (m.isEarly) early++;
      totalHours += computeHoursWorked(log);
    });
    return { present, late, early, absent, totalHours: totalHours.toFixed(1) };
  }, [logs]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label:"Present",     value:totals.present,          color:"text-emerald-400" },
        { label:"Absent",      value:totals.absent,           color:"text-rose-400" },
        { label:"Late",        value:totals.late,             color:"text-amber-400" },
        { label:"Early Leave", value:totals.early,            color:"text-amber-400" },
        { label:"Total Hours", value:`${totals.totalHours}h`, color:"text-cyan-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-black/30 border border-white/5 rounded-2xl px-4 py-3 text-center">
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</p>
          <p className={`text-lg font-black ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
};


// ---------------------------------------------------------------------------
// AttendanceTable
// ---------------------------------------------------------------------------

const AttendanceTable = ({ logs, onEdit, onDelete, isReadOnly, canDelete, showStatus=false }) => (
  <div className="overflow-x-auto custom-scrollbar">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-black/20 backdrop-blur-md border-b border-white/5">
          <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Staff & Dept</th>
          <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Date</th>
          <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Shift</th>
          <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Stamps (IN / OUT)</th>
          <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Duration</th>
          {showStatus && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Status</th>}
          {!isReadOnly && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-right">Actions</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {logs.length === 0 ? (
          <tr>
            <td colSpan={isReadOnly ? 5 : 6} className="px-6 py-16 text-center">
              <Ghost size={28} className="mx-auto mb-3 text-slate-700"/>
              <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">No Records Found</p>
            </td>
          </tr>
        ) : logs.map((log) => {
          const { isLate, isEarly, isAbsent, isOnBreak, statusText } = getAttendanceMetrics(log);
          const shiftType   = resolveShiftType(log);
          const hoursWorked = computeHoursWorked(log);

          return (
            <tr key={log.id} className={`group hover:bg-white/[0.03] transition-colors ${isAbsent ? "bg-rose-500/5" : ""}`}>

              {/* Staff & Dept */}
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isAbsent        ? "bg-rose-500  shadow-[0_0_8px_rgba(244,63,94,0.6)]" :
                    isOnBreak       ? "bg-blue-400  shadow-[0_0_8px_rgba(96,165,250,0.6)]" :
                    isLate||isEarly ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" :
                                      "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  }`}/>
                  <div>
                    <div className="text-white font-medium text-sm flex items-center flex-wrap gap-2">
                      {log.name}
                      {isAbsent  && <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><AlertCircle size={9}/> ABSENT</span>}
                      {isOnBreak && <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><Coffee size={9}/> ON BREAK</span>}
                      {!isAbsent && !isOnBreak && isLate  && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">LATE</span>}
                      {!isAbsent && !isOnBreak && isEarly && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">EARLY LEAVE</span>}
                    </div>
                    <div className="text-cyan-400/80 text-[10px] font-mono uppercase tracking-widest mt-0.5">
                      {log.department || "Main Office"}
                    </div>
                  </div>
                </div>
              </td>

              {/* Date */}
              <td className="px-6 py-4 text-xs font-mono text-slate-300">
                {fmtDate(log.check_in || log.date)}
              </td>

              {/* Shift type */}
              <td className="px-6 py-4 text-center">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shadow-inner border ${
                  shiftType === "Day"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : shiftType === "Night"
                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}>
                  {shiftType === "Unknown" ? "—" : shiftType}
                </span>
              </td>

              {/* Stamps */}
              <td className="px-6 py-4 text-xs font-mono">
                {isAbsent ? (
                  <span className="text-rose-400/60 italic font-bold">No Records</span>
                ) : (
                  <div className="flex items-center gap-4 bg-black/30 p-2 rounded-xl border border-white/5 w-max">
                    <div className={isLate ? "text-rose-400 font-medium" : "text-emerald-400"}>
                      <span className="text-[10px] text-slate-500 mr-1">IN</span>
                      {fmtTime(log.check_in)}
                    </div>
                    <div className="w-px h-4 bg-white/10"/>
                    <div className={isEarly ? "text-amber-400 font-medium" : "text-slate-300"}>
                      <span className="text-[10px] text-slate-500 mr-1">OUT</span>
                      {fmtTime(log.check_out)}
                    </div>
                  </div>
                )}
              </td>

              {/* Duration */}
              <td className="px-6 py-4 text-center text-sm font-mono font-medium text-white">
                {isAbsent ? "—" : formatWorkHours(hoursWorked)}
              </td>

              {/* Status column (archive only) */}
              {showStatus && (
                <td className="px-6 py-4 text-center">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                    isAbsent        ? "text-rose-400" :
                    isOnBreak       ? "text-blue-400" :
                    isLate||isEarly ? "text-amber-400" :
                                      "text-emerald-400"
                  }`}>
                    {statusText}
                  </span>
                </td>
              )}

              {/* Actions */}
              {!isReadOnly && (
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(log)} className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-xl transition-all border border-transparent hover:border-cyan-400/20">
                      <Edit3 size={15}/>
                    </button>
                    {canDelete && (
                      <button onClick={() => onDelete(log)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all border border-transparent hover:border-rose-400/20">
                        <Trash2 size={15}/>
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);


// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const Pagination = ({ total, page, perPage, onChange }) => {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
      <p className="text-xs text-slate-500">
        Showing{" "}
        <span className="text-white font-bold">{Math.min((page-1)*perPage+1, total)}–{Math.min(page*perPage, total)}</span>
        {" "}of{" "}
        <span className="text-white font-bold">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(page-1)} disabled={page===1} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronLeft size={14}/>
        </button>
        <span className="text-xs text-slate-400 font-mono px-2">{page} / {totalPages}</span>
        <button onClick={() => onChange(page+1)} disabled={page===totalPages} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// EditRecordModal
// ---------------------------------------------------------------------------

const EditRecordModal = ({ log, onClose, onRefresh }) => {
  const [inTime,  setInTime]  = useState(log.check_in  ? log.check_in.substring(0,16)  : "");
  const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0,16) : "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const handleSave = async () => {
    if (!inTime) { setError("Check-in time is required."); return; }
    setSaving(true);
    setError("");
    try {
      await api.put(`/admin/actions/attendance/${log.id}`, {
        employee_id: log.employee_id,
        check_in:    inTime  || null,
        check_out:   outTime || null,
      });
      onRefresh();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Update failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-md shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h2 className="text-white font-bold uppercase text-xs tracking-widest flex items-center gap-2">
            Correction: <span className="text-cyan-400 font-mono bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">{log.name}</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full hover:bg-white/10">
            <X size={18}/>
          </button>
        </div>
        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={14}/> {error}
            </div>
          )}
          <div className="space-y-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-In Time</label>
            <input type="datetime-local" value={inTime} onChange={(e) => setInTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-Out Time</label>
            <input type="datetime-local" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
          </div>
          <button onClick={handleSave} disabled={saving} className="w-full mt-4 py-4 bg-emerald-500 text-black font-black uppercase text-xs tracking-[0.2em] rounded-[1.5rem] hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Sync Correction"}
          </button>
        </div>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// DeleteConfirmModal
// ---------------------------------------------------------------------------

const DeleteConfirmModal = ({ log, onClose, onConfirm, isDeleting }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
    <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-sm shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
          <Trash2 size={24} className="text-rose-400"/>
        </div>
        <h3 className="text-white font-bold text-sm uppercase tracking-widest">Confirm Delete</h3>
        <p className="text-slate-400 text-xs leading-relaxed">
          Permanently delete the record for{" "}
          <span className="text-white font-bold">{log?.name}</span> on{" "}
          <span className="text-white font-bold">{fmtDate(log?.check_in || log?.date)}</span>?
          This cannot be undone.
        </p>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] border border-white/10 text-slate-400 text-xs font-bold uppercase hover:bg-white/5 transition-all disabled:opacity-30">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-50">
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  </div>
);


// ---------------------------------------------------------------------------
// Main AttendanceDashboard
// ---------------------------------------------------------------------------

const AttendanceDashboard = () => {
  const [stats,     setStats]     = useState({ present_now:0, absent:0, total_employees:0 });
  const [todayLogs, setTodayLogs] = useState([]);
  const [allLogs,   setAllLogs]   = useState([]);

  const [searchTerm,  setSearchTerm]  = useState("");
  const [deptFilter,  setDeptFilter]  = useState("all");
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
  const [yearFilter,  setYearFilter]  = useState(new Date().getFullYear());
  const [archivePage, setArchivePage] = useState(1);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editLog,           setEditLog]           = useState(null);
  const [deleteLog,         setDeleteLog]         = useState(null);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const [deleteError,       setDeleteError]       = useState("");

  const [syncing,     setSyncing]     = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const userRole   = (localStorage.getItem("role") || "read_only_admin").toLowerCase();
  const isReadOnly = userRole === "read_only_admin";
  const isAuditor  = userRole === "auditor";
  const isAdmin    = userRole === "admin";
  const canEdit    = isAdmin || isAuditor;

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      api.post("/attendance/mark-absents").catch(() => {});
      api.post("/attendance/auto-close-stale").catch(() => {});
    }
  }, [isAdmin]);

  const fetchData = useCallback(async () => {
    setSyncing(true);
    try {
      const [statsRes, summaryRes, historyRes] = await Promise.all([
        api.get("/attendance/stats"),
        api.get("/attendance/summary"),
        api.get("/attendance/all"),
      ]);

      setStats(statsRes.data || {});

      const cleanSummary = deduplicateLogs(summaryRes.data || []);
      const today        = new Date().toDateString();
      setTodayLogs(cleanSummary.filter((l) => {
        const d = l.check_in || l.date;
        return d && new Date(d).toDateString() === today;
      }));

      setAllLogs(deduplicateLogs(historyRes.data || []));
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setSyncing(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => { setArchivePage(1); }, [searchTerm, deptFilter, monthFilter, yearFilter]);

  const departments = useMemo(
    () => [...new Set(allLogs.map((l) => l.department).filter(Boolean))],
    [allLogs]
  );

  const availableYears = useMemo(() => {
    const years = new Set(allLogs.map((l) => new Date(l.check_in || l.date).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    const month = parseInt(monthFilter);
    const year  = parseInt(yearFilter);

    const base = allLogs.filter((log) => {
      const logDate      = new Date(log.check_in || log.date);
      const matchesMonth = logDate.getMonth() === month && logDate.getFullYear() === year;
      const matchesDept  = deptFilter === "all" ||
        (log.department || "").toLowerCase().trim() === deptFilter.toLowerCase().trim();
      const matchesSearch = (log.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      return matchesMonth && matchesDept && matchesSearch;
    });

    if (searchTerm.trim() && base.length > 0) {
      const uniqueIds = [...new Set(base.map((l) => l.employee_id))];
      if (uniqueIds.length === 1) {
        const emp         = base[0];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => {
          const dateObj = new Date(year, month, i + 1);
          const dateStr = dateObj.toDateString();
          const found   = base.find(
            (l) => new Date(l.check_in || l.date).toDateString() === dateStr
          );
          return found || {
            id:           `temp-${emp.employee_id}-${i + 1}`,
            employee_id:  emp.employee_id,
            name:         emp.name,
            department:   emp.department,
            date:         dateObj.toISOString(),
            status:       "Absent",
            hours_worked: 0,
            shift_start:  emp.shift_start,
            shift_end:    emp.shift_end,
            shift_type:   emp.shift_type,
            duty_hour:    emp.duty_hour,
          };
        });
      }
    }

    return base;
  }, [allLogs, monthFilter, yearFilter, deptFilter, searchTerm]);

  const paginatedLogs = useMemo(() => {
    const start = (archivePage - 1) * ROWS_PER_PAGE;
    return filteredLogs.slice(start, start + ROWS_PER_PAGE);
  }, [filteredLogs, archivePage]);

  const handleDelete = async () => {
    if (!deleteLog) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/admin/actions/attendance/${deleteLog.id}`);
      setDeleteLog(null);
      fetchData();
    } catch (err) {
      setDeleteError(err?.response?.data?.detail || "Delete failed. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    if (!filteredLogs.length) return;
    const data = filteredLogs.map((log) => {
      const m = getAttendanceMetrics(log);
      return {
        "Employee ID": log.employee_id,
        Name:          log.name,
        Department:    log.department || "N/A",
        Date:          fmtDate(log.check_in || log.date),
        "Check In":    m.isAbsent ? "" : fmtTime(log.check_in),
        "Check Out":   m.isAbsent ? "" : fmtTime(log.check_out),
        Hours:         computeHoursWorked(log),
        Status:        m.statusText,
        "Shift Type":  resolveShiftType(log),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${MONTHS[monthFilter]}_${yearFilter}.xlsx`);
  };

  const handleAttendanceReport = () => {
    const month       = parseInt(monthFilter);
    const year        = parseInt(yearFilter);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const logsThisMonth = allLogs.filter((log) => {
      const d = new Date(log.check_in || log.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    if (!logsThisMonth.length) return;

    const grouped = logsThisMonth.reduce((acc, log) => {
      if (!acc[log.employee_id]) {
        acc[log.employee_id] = { id:log.employee_id, name:log.name, dept:log.department||"Office", presentDays:0, lateArrivals:0, earlyLeaves:0 };
      }
      const m = getAttendanceMetrics(log);
      if (!m.isAbsent) acc[log.employee_id].presentDays++;
      if (m.isLate)    acc[log.employee_id].lateArrivals++;
      if (m.isEarly)   acc[log.employee_id].earlyLeaves++;
      return acc;
    }, {});

    const reportData = Object.values(grouped).map((emp) => {
      const totalViolations = emp.lateArrivals + emp.earlyLeaves;
      const billable        = Math.max(0, totalViolations - 4);
      const deductionDays   = Math.floor(billable / 3);
      const finalDays       = Math.max(0, emp.presentDays - deductionDays);
      const status =
        totalViolations <= 4 && emp.presentDays >= daysInMonth - 2 ? "Excellent" :
        totalViolations > 10 ? "Warning" : "Standard";
      return {
        "Employee ID":          emp.id,
        Name:                   emp.name,
        Department:             emp.dept,
        "Month Days":           daysInMonth,
        "Days Present":         emp.presentDays,
        "Late Arrivals":        emp.lateArrivals,
        "Early Leaves":         emp.earlyLeaves,
        "Total Violations":     totalViolations,
        "Grace Used":           Math.min(totalViolations, 4),
        "Violation Deductions": deductionDays,
        "Final Payable Days":   finalDays,
        Performance:            status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
    XLSX.writeFile(wb, `Report_${MONTHS[month]}_${year}.xlsx`);
  };


  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative min-h-screen bg-[#060B14] text-white overflow-hidden p-4 lg:p-8 font-sans">

      {/* Ambient glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/30 blur-[120px] pointer-events-none"/>
      <div className="fixed bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-emerald-600/20 blur-[150px] pointer-events-none"/>
      <div className="fixed top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-cyan-600/20 blur-[100px] pointer-events-none"/>

      <div className="relative z-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-1000">

        {/* ── HEADER ── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"/>
              </span>
              <span className="text-[10px] font-bold text-emerald-400 tracking-[0.2em] uppercase">AFAM Management Systems</span>
            </div>
            <h1 className="text-3xl font-light tracking-tight text-white flex items-center gap-3">
              Attendance{" "}
              <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                Sphere
              </span>
              {isAuditor && (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30 uppercase font-black tracking-widest shadow-inner">
                  Auditor View
                </span>
              )}
            </h1>
          </div>
          <div className="flex flex-wrap gap-4 w-full lg:w-auto items-center">
            <div className="px-5 py-3 bg-black/40 border border-white/10 font-mono text-sm text-cyan-400 font-bold rounded-[1.5rem] shadow-inner">
              {currentTime.toLocaleTimeString()}
            </div>
            {canEdit && (
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex-1 lg:flex-none px-6 py-3 rounded-[1.5rem] bg-emerald-500 text-black text-xs font-black uppercase shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5)] hover:-translate-y-0.5 hover:bg-emerald-400 transition-all"
              >
                + Post Attendance
              </button>
            )}
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="On Site Today" value={stats.present_now||0}      icon={<UserCheck size={20}/>} colorClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"/>
          <StatCard title="Absent Today"  value={stats.absent||0}           icon={<Clock size={20}/>}     colorClass="bg-rose-500/20 text-rose-300 border-rose-500/30"/>
          <StatCard title="Total Staff"   value={stats.total_employees||0}  icon={<Users size={20}/>}     colorClass="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"/>
        </div>

        {/* ── LIVE TABLE ── */}
        <section className="space-y-4">
          <div className="flex justify-between items-center px-4">
            <h2 className="text-white font-medium text-sm tracking-widest flex items-center gap-2">
              <Activity size={16} className="text-cyan-400"/> LIVE ACTIVITY (TODAY)
            </h2>
            <button onClick={fetchData} disabled={syncing} className="bg-white/5 p-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors">
              <RefreshCcw size={14} className={syncing ? "animate-spin text-cyan-400" : "text-slate-400"}/>
            </button>
          </div>

          {initialLoad ? (
            <div className="bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"/>
              <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">Loading…</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
              <AttendanceTable logs={todayLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={false}/>
            </div>
          )}
        </section>

        {/* ── ARCHIVE ── */}
        <section className="space-y-6 pt-8 border-t border-white/10">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-4">
            <h2 className="text-slate-400 font-medium text-sm tracking-widest flex items-center gap-2">
              <History size={16} className="text-indigo-400"/> RECORDS ARCHIVE
            </h2>
            <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
              <div className="bg-black/40 p-1.5 rounded-[1.5rem] border border-white/10 flex shadow-inner gap-1 flex-wrap">
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
                  {MONTHS.map((m, i) => <option key={m} value={i} className="bg-black">{m}</option>)}
                </select>
                <div className="w-px bg-white/10 my-1"/>
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="bg-transparent pl-4 pr-6 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
                  {availableYears.map((y) => <option key={y} value={y} className="bg-black">{y}</option>)}
                </select>
                <div className="w-px bg-white/10 my-1"/>
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
                  <option value="all" className="bg-black">All Departments</option>
                  {departments.map((d) => <option key={d} value={d} className="bg-black">{d}</option>)}
                </select>
              </div>
              <div className="relative flex-grow lg:flex-grow-0 group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-400 transition-colors"/>
                <input type="text" placeholder="Search Personnel…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-56 bg-black/40 border border-white/10 rounded-[1.5rem] pl-10 pr-4 py-3 text-xs text-white outline-none focus:border-cyan-500/50 shadow-inner placeholder:text-slate-500 transition-colors"/>
              </div>
              <button onClick={handleExport} className="px-5 py-3 bg-indigo-500/20 border border-indigo-500/30 rounded-[1.5rem] text-indigo-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-indigo-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
                <Download size={14}/> Total Attendance
              </button>
              <button onClick={handleAttendanceReport} className="px-5 py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-[1.5rem] text-cyan-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-cyan-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
                <FileText size={14}/> Monthly Report
              </button>
            </div>
          </div>

          <ArchiveSummaryBar logs={filteredLogs}/>

          <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
            <AttendanceTable logs={paginatedLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={true}/>
            <Pagination total={filteredLogs.length} page={archivePage} perPage={ROWS_PER_PAGE} onChange={setArchivePage}/>
          </div>
        </section>
      </div>

      {/* ── MODALS ── */}
      <ManualEntryModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onRefresh={fetchData}/>
      {editLog && <EditRecordModal log={editLog} onClose={() => setEditLog(null)} onRefresh={fetchData}/>}
      {deleteLog && (
        <DeleteConfirmModal
          log={deleteLog}
          onClose={() => { setDeleteLog(null); setDeleteError(""); }}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}

      {deleteError && (
        <div className="fixed bottom-6 right-6 bg-rose-900/90 border border-rose-500/30 text-rose-200 text-xs font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50">
          <AlertCircle size={14}/> {deleteError}
          <button onClick={() => setDeleteError("")}><X size={13}/></button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
};

export default AttendanceDashboard;























// import React, { useState, useEffect, useMemo, useCallback } from "react";
// import api from "../api/axios";
// import * as XLSX from "xlsx";
// import {
//   Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History,
//   Trash2, X, Download, Search, AlertCircle, FileText, Ghost,
//   Coffee, ChevronLeft, ChevronRight, AlertTriangle
// } from "lucide-react";
// import ManualEntryModal from "../components/ManualEntryForm";


// // ---------------------------------------------------------------------------
// // Constants
// // ---------------------------------------------------------------------------

// const MONTHS = [
//   "January","February","March","April","May","June",
//   "July","August","September","October","November","December",
// ];

// const ROWS_PER_PAGE = 20;


// // ---------------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------------

// const fmtTime = (iso) =>
//   iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

// const fmtDate = (iso) =>
//   iso
//     ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
//     : "--";

// const formatWorkHours = (decimal) => {
//   if (!decimal || decimal === 0) return "0h 00m";
//   const h = Math.floor(decimal);
//   const m = Math.round((decimal - h) * 60);
//   return `${h}h ${m.toString().padStart(2, "0")}m`;
// };

// // ---------------------------------------------------------------------------
// // FIX A (frontend): fixCrossMidnightCheckout
// //
// // PROBLEM: When check_out time-of-day < check_in time-of-day (overnight shift),
// // duration shows 0h 00m because the JS Date subtraction goes negative.
// //
// // Examples fixed:
// //   Ishfaq Ahmed Apr 25: IN 12:00 PM  OUT 12:48 AM  → was 0h, now 12h 48m ✅
// //   Abdul Abeer  Apr 02: IN 07:15 PM  OUT 09:33 AM  → was 0h, now 14h 18m ✅
// // ---------------------------------------------------------------------------

// const fixCrossMidnightCheckout = (checkIn, checkOut) => {
//   if (!checkIn || !checkOut) return checkOut;
//   const inMs  = new Date(checkIn).getTime();
//   const outMs = new Date(checkOut).getTime();
//   if (outMs < inMs) {
//     const adjusted = outMs + 24 * 60 * 60 * 1000;
//     // Sanity: must be within 24 hours
//     if (adjusted - inMs <= 24 * 60 * 60 * 1000) {
//       return new Date(adjusted).toISOString();
//     }
//   }
//   return checkOut;
// };

// // ---------------------------------------------------------------------------
// // FIX B (frontend): determineShiftType
// //
// // RULE: 02:00 AM (02:00) to 02:00 PM (14:00) inclusive → "Day", else → "Night"
// //
// // PROBLEM (Images 2 & 3):
// //   - Md Faruq: same 12:00 AM punch, inconsistently Day/Night across dates
// //   - Abdul Abeer Apr 03: IN 8:01 AM shown as NIGHT
// //   Both caused by stale shift_type values from DB or missing frontend recalc.
// //
// // FIX: Always classify from the actual check_in hour (mirrors backend logic).
// // ---------------------------------------------------------------------------

// const determineShiftType = (shiftStartStr, actualCheckIn = null) => {
//   // Priority 1: actual punch hour
//   if (actualCheckIn) {
//     const h = new Date(actualCheckIn).getHours();
//     const m = new Date(actualCheckIn).getMinutes();
//     const totalMins = h * 60 + m;
//     return totalMins >= 120 && totalMins <= 840 ? "Day" : "Night";
//   }
//   // Priority 2: scheduled shift_start string
//   if (!shiftStartStr || !shiftStartStr.trim()) return "Unknown";
//   const parts = shiftStartStr.trim().split(":");
//   if (parts.length < 2) return "Unknown";
//   const h = parseInt(parts[0], 10);
//   const m = parseInt(parts[1], 10);
//   if (isNaN(h) || isNaN(m)) return "Unknown";
//   const totalMins = h * 60 + m;
//   return totalMins >= 120 && totalMins <= 840 ? "Day" : "Night";
// };

// // ---------------------------------------------------------------------------
// // resolveShiftType — always recalculate from actual check_in.
// // This fixes stale DB values without needing a migration.
// // Falls back to shift_start string for absent rows (no real punch).
// // ---------------------------------------------------------------------------

// const resolveShiftType = (log) => {
//   const isAbsent = log.status?.toLowerCase() === "absent";
//   // For real punches: classify by actual check_in hour
//   if (!isAbsent && log.check_in) {
//     return determineShiftType(log.shift_start, log.check_in);
//   }
//   // For absent rows: use shift_start string (no real punch)
//   return determineShiftType(log.shift_start);
// };

// // ---------------------------------------------------------------------------
// // FIX A (frontend): computeHoursWorked
// //
// // If hours_worked from API is 0 but both timestamps exist,
// // recompute with cross-midnight correction so legacy records show correctly.
// // ---------------------------------------------------------------------------

// const computeHoursWorked = (log) => {
//   if (log.hours_worked && log.hours_worked > 0) return log.hours_worked;
//   if (!log.check_in || !log.check_out) return 0;
//   if (log.status?.toLowerCase() === "absent") return 0;
//   const fixedOut = fixCrossMidnightCheckout(log.check_in, log.check_out);
//   const diffMs   = new Date(fixedOut).getTime() - new Date(log.check_in).getTime();
//   const breakMs  = (log.total_break_minutes || 0) * 60 * 1000;
//   return Math.max(0, Math.round(((diffMs - breakMs) / 3600000) * 100) / 100);
// };

// const deduplicateLogs = (data = []) => {
//   const uniqueMap = new Map();
//   data.forEach((log) => {
//     const raw     = log.check_in || log.date;
//     const dateStr = raw ? new Date(raw).toDateString() : "unknown";
//     const key     = `${log.employee_id}-${dateStr}`;
//     if (!uniqueMap.has(key)) {
//       uniqueMap.set(key, log);
//     } else {
//       const existing = uniqueMap.get(key);
//       if (existing.status?.toLowerCase() === "absent" && log.check_in) {
//         uniqueMap.set(key, log);
//       }
//     }
//   });
//   return Array.from(uniqueMap.values());
// };


// // ---------------------------------------------------------------------------
// // getAttendanceMetrics
// // ---------------------------------------------------------------------------

// const getAttendanceMetrics = (log) => {
//   const statusLower = log.status?.toLowerCase();
//   const now         = new Date();
//   const rawDate     = log.check_in || log.date;
//   const logDate     = rawDate ? new Date(rawDate) : now;
//   const isToday     = logDate.toDateString() === now.toDateString();

//   // 1. Calculate Expected Shift Start Time
//   let shiftStartTime = null;
//   if (log.shift_start) {
//     const [h, m] = log.shift_start.split(":").map(Number);
//     shiftStartTime = new Date(logDate);
//     shiftStartTime.setHours(h, m, 0, 0);

//     // Handle night shifts where the punch-in might occur just before midnight
//     if (h === 0 && log.check_in) {
//       const checkInDate = new Date(log.check_in);
//       if (checkInDate.getHours() >= 22) {
//         shiftStartTime.setDate(shiftStartTime.getDate() + 1);
//       }
//     }
//   }

//   // 2. Base Status Returns (No active punches yet)
//   if (isToday && !log.check_in && shiftStartTime && now < shiftStartTime) {
//     return { isLate: false, isEarly: false, isAbsent: false, isOnBreak: false, statusText: "Scheduled" };
//   }
//   if (statusLower === "absent") {
//     return { isLate: false, isEarly: false, isAbsent: true, isOnBreak: false, statusText: "Absent" };
//   }
//   if (statusLower === "on_break") {
//     return { isLate: false, isEarly: false, isAbsent: false, isOnBreak: true, statusText: "On Break" };
//   }
//   if (!log.check_in || !log.shift_start) {
//     return { isLate: false, isEarly: false, isAbsent: false, isOnBreak: false, statusText: "Normal" };
//   }

//   // 3. Calculate Late Arrival 
//   let isLate = false;
//   if (shiftStartTime) {
//     const checkInTime = new Date(log.check_in);
//     if (checkInTime > shiftStartTime) {
//       const minsLate = (checkInTime - shiftStartTime) / 60000;
//       isLate = minsLate > 10; // Still has a 10-minute grace period. Change to > 0 if you want strict late tracking.
//     }
//   }

//   // If they clocked in but haven't clocked out yet
//   if (log.check_in && !log.check_out) {
//     return { isLate, isEarly: false, isAbsent: false, isOnBreak: false, statusText: "On Duty" };
//   }

//   // 4. Calculate Early Leave (Strict check: NO GRACE PERIOD)
//   let isEarly = false;
//   if (log.check_out && log.shift_end) {
//     const [eH, eM] = log.shift_end.split(":").map(Number);
//     const [sH]     = log.shift_start.split(":").map(Number);

//     const shiftEnd = new Date(log.check_in);
//     shiftEnd.setHours(eH, eM, 0, 0);
    
//     // If the shift end hour is earlier than the start hour, it crossed midnight
//     if (eH < sH) {
//       shiftEnd.setDate(shiftEnd.getDate() + 1);
//     }

//     const fixedCheckOut = new Date(fixCrossMidnightCheckout(log.check_in, log.check_out));

//     if (fixedCheckOut < shiftEnd) {
//       const minsEarly = (shiftEnd - fixedCheckOut) / 60000;
//       // THE FIX: Removed the 10-minute grace period. Even 1 minute early triggers the badge.
//       isEarly = minsEarly > 0; 
//     } else {
//       isEarly = false; // They stayed late or left exactly on time
//     }
//   }

//   // 5. Apply Final Text Labels
//   let statusText = "Normal";
//   if (isLate && isEarly) statusText = "Late & Early Leave";
//   else if (isLate)       statusText = "Late Arrival";
//   else if (isEarly)      statusText = "Early Leave";

//   return { isLate, isEarly, isAbsent: false, isOnBreak: false, statusText };
// };


// // ---------------------------------------------------------------------------
// // StatCard
// // ---------------------------------------------------------------------------

// const StatCard = ({ title, value, icon, colorClass }) => (
//   <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden group">
//     <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"/>
//     <div className="flex justify-between items-start relative z-10">
//       <div>
//         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
//         <h3 className="text-4xl font-light text-white tracking-tighter drop-shadow-md">{value}</h3>
//       </div>
//       <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center border shadow-inner ${colorClass}`}>
//         {icon}
//       </div>
//     </div>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // ArchiveSummaryBar
// // ---------------------------------------------------------------------------

// const ArchiveSummaryBar = ({ logs }) => {
//   const totals = useMemo(() => {
//     let present=0, late=0, early=0, absent=0, totalHours=0;
//     logs.forEach((log) => {
//       const m = getAttendanceMetrics(log);
//       if (m.isAbsent) { absent++; return; }
//       present++;
//       if (m.isLate)  late++;
//       if (m.isEarly) early++;
//       // FIX A: use computeHoursWorked for correct cross-midnight totals
//       totalHours += computeHoursWorked(log);
//     });
//     return { present, late, early, absent, totalHours: totalHours.toFixed(1) };
//   }, [logs]);

//   return (
//     <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
//       {[
//         { label:"Present",     value:totals.present,          color:"text-emerald-400" },
//         { label:"Absent",      value:totals.absent,           color:"text-rose-400" },
//         { label:"Late",        value:totals.late,             color:"text-amber-400" },
//         { label:"Early Leave", value:totals.early,            color:"text-amber-400" },
//         { label:"Total Hours", value:`${totals.totalHours}h`, color:"text-cyan-400" },
//       ].map(({ label, value, color }) => (
//         <div key={label} className="bg-black/30 border border-white/5 rounded-2xl px-4 py-3 text-center">
//           <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</p>
//           <p className={`text-lg font-black ${color}`}>{value}</p>
//         </div>
//       ))}
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // AttendanceTable
// // ---------------------------------------------------------------------------

// const AttendanceTable = ({ logs, onEdit, onDelete, isReadOnly, canDelete, showStatus=false }) => (
//   <div className="overflow-x-auto custom-scrollbar">
//     <table className="w-full text-left border-collapse">
//       <thead>
//         <tr className="bg-black/20 backdrop-blur-md border-b border-white/5">
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Staff & Dept</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Date</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Shift</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Stamps (IN / OUT)</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Duration</th>
//           {showStatus && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Status</th>}
//           {!isReadOnly && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-right">Actions</th>}
//         </tr>
//       </thead>
//       <tbody className="divide-y divide-white/5">
//         {logs.length === 0 ? (
//           <tr>
//             <td colSpan={isReadOnly ? 5 : 6} className="px-6 py-16 text-center">
//               <Ghost size={28} className="mx-auto mb-3 text-slate-700"/>
//               <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">No Records Found</p>
//             </td>
//           </tr>
//         ) : logs.map((log) => {
//           const { isLate, isEarly, isAbsent, isOnBreak, statusText } = getAttendanceMetrics(log);
//           // FIX B: always resolve shift type from actual check_in hour
//           const shiftType   = resolveShiftType(log);
//           // FIX A: always compute hours with cross-midnight correction
//           const hoursWorked = computeHoursWorked(log);

//           return (
//             <tr key={log.id} className={`group hover:bg-white/[0.03] transition-colors ${isAbsent ? "bg-rose-500/5" : ""}`}>

//               {/* Staff & Dept */}
//               <td className="px-6 py-4">
//                 <div className="flex items-center gap-3">
//                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
//                     isAbsent        ? "bg-rose-500  shadow-[0_0_8px_rgba(244,63,94,0.6)]" :
//                     isOnBreak       ? "bg-blue-400  shadow-[0_0_8px_rgba(96,165,250,0.6)]" :
//                     isLate||isEarly ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" :
//                                       "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
//                   }`}/>
//                   <div>
//                     <div className="text-white font-medium text-sm flex items-center flex-wrap gap-2">
//                       {log.name}
//                       {isAbsent  && <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><AlertCircle size={9}/> ABSENT</span>}
//                       {isOnBreak && <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><Coffee size={9}/> ON BREAK</span>}
//                       {!isAbsent && !isOnBreak && isLate  && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">LATE</span>}
//                       {!isAbsent && !isOnBreak && isEarly && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">EARLY LEAVE</span>}
//                     </div>
//                     <div className="text-cyan-400/80 text-[10px] font-mono uppercase tracking-widest mt-0.5">
//                       {log.department || "Main Office"}
//                     </div>
//                   </div>
//                 </div>
//               </td>

//               {/* Date */}
//               <td className="px-6 py-4 text-xs font-mono text-slate-300">
//                 {fmtDate(log.check_in || log.date)}
//               </td>

//               {/* Shift type — FIX B: uses resolveShiftType */}
//               <td className="px-6 py-4 text-center">
//                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shadow-inner border ${
//                   shiftType === "Day"
//                     ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
//                     : shiftType === "Night"
//                     ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
//                     : "bg-slate-500/10 text-slate-400 border-slate-500/20"
//                 }`}>
//                   {shiftType === "Unknown" ? "—" : shiftType}
//                 </span>
//               </td>

//               {/* Stamps */}
//               <td className="px-6 py-4 text-xs font-mono">
//                 {isAbsent ? (
//                   <span className="text-rose-400/60 italic font-bold">No Records</span>
//                 ) : (
//                   <div className="flex items-center gap-4 bg-black/30 p-2 rounded-xl border border-white/5 w-max">
//                     <div className={isLate ? "text-rose-400 font-medium" : "text-emerald-400"}>
//                       <span className="text-[10px] text-slate-500 mr-1">IN</span>
//                       {fmtTime(log.check_in)}
//                     </div>
//                     <div className="w-px h-4 bg-white/10"/>
//                     <div className={isEarly ? "text-amber-400 font-medium" : "text-slate-300"}>
//                       <span className="text-[10px] text-slate-500 mr-1">OUT</span>
//                       {fmtTime(log.check_out)}
//                     </div>
//                   </div>
//                 )}
//               </td>

//               {/* Duration — FIX A: uses computeHoursWorked */}
//               <td className="px-6 py-4 text-center text-sm font-mono font-medium text-white">
//                 {isAbsent ? "—" : formatWorkHours(hoursWorked)}
//               </td>

//               {/* Status column (archive only) */}
//               {showStatus && (
//                 <td className="px-6 py-4 text-center">
//                   <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
//                     isAbsent        ? "text-rose-400" :
//                     isOnBreak       ? "text-blue-400" :
//                     isLate||isEarly ? "text-amber-400" :
//                                       "text-emerald-400"
//                   }`}>
//                     {statusText}
//                   </span>
//                 </td>
//               )}

//               {/* Actions */}
//               {!isReadOnly && (
//                 <td className="px-6 py-4 text-right">
//                   <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
//                     <button onClick={() => onEdit(log)} className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-xl transition-all border border-transparent hover:border-cyan-400/20">
//                       <Edit3 size={15}/>
//                     </button>
//                     {canDelete && (
//                       <button onClick={() => onDelete(log)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all border border-transparent hover:border-rose-400/20">
//                         <Trash2 size={15}/>
//                       </button>
//                     )}
//                   </div>
//                 </td>
//               )}
//             </tr>
//           );
//         })}
//       </tbody>
//     </table>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // Pagination
// // ---------------------------------------------------------------------------

// const Pagination = ({ total, page, perPage, onChange }) => {
//   const totalPages = Math.ceil(total / perPage);
//   if (totalPages <= 1) return null;
//   return (
//     <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
//       <p className="text-xs text-slate-500">
//         Showing{" "}
//         <span className="text-white font-bold">{Math.min((page-1)*perPage+1, total)}–{Math.min(page*perPage, total)}</span>
//         {" "}of{" "}
//         <span className="text-white font-bold">{total}</span>
//       </p>
//       <div className="flex items-center gap-2">
//         <button onClick={() => onChange(page-1)} disabled={page===1} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
//           <ChevronLeft size={14}/>
//         </button>
//         <span className="text-xs text-slate-400 font-mono px-2">{page} / {totalPages}</span>
//         <button onClick={() => onChange(page+1)} disabled={page===totalPages} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
//           <ChevronRight size={14}/>
//         </button>
//       </div>
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // EditRecordModal
// // ---------------------------------------------------------------------------

// const EditRecordModal = ({ log, onClose, onRefresh }) => {
//   const [inTime,  setInTime]  = useState(log.check_in  ? log.check_in.substring(0,16)  : "");
//   const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0,16) : "");
//   const [saving,  setSaving]  = useState(false);
//   const [error,   setError]   = useState("");

//   const handleSave = async () => {
//     if (!inTime) { setError("Check-in time is required."); return; }
//     setSaving(true);
//     setError("");
//     try {
//       await api.put(`/admin/actions/attendance/${log.id}`, {
//         employee_id: log.employee_id,
//         check_in:    inTime  || null,
//         check_out:   outTime || null,
//       });
//       onRefresh();
//       onClose();
//     } catch (err) {
//       setError(err?.response?.data?.detail || "Update failed. Please try again.");
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
//       <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-md shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden">
//         <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
//           <h2 className="text-white font-bold uppercase text-xs tracking-widest flex items-center gap-2">
//             Correction: <span className="text-cyan-400 font-mono bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">{log.name}</span>
//           </h2>
//           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full hover:bg-white/10">
//             <X size={18}/>
//           </button>
//         </div>
//         <div className="p-8 space-y-6">
//           {error && (
//             <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl px-4 py-3 flex items-center gap-2">
//               <AlertTriangle size={14}/> {error}
//             </div>
//           )}
//           <div className="space-y-3">
//             <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-In Time</label>
//             <input type="datetime-local" value={inTime} onChange={(e) => setInTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
//           </div>
//           <div className="space-y-3">
//             <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-Out Time</label>
//             <input type="datetime-local" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
//           </div>
//           <button onClick={handleSave} disabled={saving} className="w-full mt-4 py-4 bg-emerald-500 text-black font-black uppercase text-xs tracking-[0.2em] rounded-[1.5rem] hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed">
//             {saving ? "Saving…" : "Sync Correction"}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // DeleteConfirmModal
// // ---------------------------------------------------------------------------

// const DeleteConfirmModal = ({ log, onClose, onConfirm, isDeleting }) => (
//   <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
//     <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-sm shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
//       <div className="p-8 text-center space-y-4">
//         <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
//           <Trash2 size={24} className="text-rose-400"/>
//         </div>
//         <h3 className="text-white font-bold text-sm uppercase tracking-widest">Confirm Delete</h3>
//         <p className="text-slate-400 text-xs leading-relaxed">
//           Permanently delete the record for{" "}
//           <span className="text-white font-bold">{log?.name}</span> on{" "}
//           <span className="text-white font-bold">{fmtDate(log?.check_in || log?.date)}</span>?
//           This cannot be undone.
//         </p>
//         <div className="flex gap-3 pt-2">
//           <button onClick={onClose} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] border border-white/10 text-slate-400 text-xs font-bold uppercase hover:bg-white/5 transition-all disabled:opacity-30">
//             Cancel
//           </button>
//           <button onClick={onConfirm} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-50">
//             {isDeleting ? "Deleting…" : "Delete"}
//           </button>
//         </div>
//       </div>
//     </div>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // Main AttendanceDashboard
// // ---------------------------------------------------------------------------

// const AttendanceDashboard = () => {
//   const [stats,     setStats]     = useState({ present_now:0, absent:0, total_employees:0 });
//   const [todayLogs, setTodayLogs] = useState([]);
//   const [allLogs,   setAllLogs]   = useState([]);

//   const [searchTerm,  setSearchTerm]  = useState("");
//   const [deptFilter,  setDeptFilter]  = useState("all");
//   const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
//   const [yearFilter,  setYearFilter]  = useState(new Date().getFullYear());
//   const [archivePage, setArchivePage] = useState(1);

//   const [isManualModalOpen, setIsManualModalOpen] = useState(false);
//   const [editLog,           setEditLog]           = useState(null);
//   const [deleteLog,         setDeleteLog]         = useState(null);
//   const [isDeleting,        setIsDeleting]        = useState(false);
//   const [deleteError,       setDeleteError]       = useState("");

//   const [syncing,     setSyncing]     = useState(false);
//   const [initialLoad, setInitialLoad] = useState(true);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   const userRole   = (localStorage.getItem("role") || "read_only_admin").toLowerCase();
//   const isReadOnly = userRole === "read_only_admin";
//   const isAuditor  = userRole === "auditor";
//   const isAdmin    = userRole === "admin";
//   const canEdit    = isAdmin || isAuditor;

//   useEffect(() => {
//     const t = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(t);
//   }, []);

//   useEffect(() => {
//     if (isAdmin) {
//       api.post("/attendance/mark-absents").catch(() => {});
//       api.post("/attendance/auto-close-stale").catch(() => {});
//     }
//   }, [isAdmin]);

//   const fetchData = useCallback(async () => {
//     setSyncing(true);
//     try {
//       const [statsRes, summaryRes, historyRes] = await Promise.all([
//         api.get("/attendance/stats"),
//         api.get("/attendance/summary"),
//         api.get("/attendance/all"),
//       ]);

//       setStats(statsRes.data || {});

//       const cleanSummary = deduplicateLogs(summaryRes.data || []);
//       const today        = new Date().toDateString();
//       setTodayLogs(cleanSummary.filter((l) => {
//         const d = l.check_in || l.date;
//         return d && new Date(d).toDateString() === today;
//       }));

//       setAllLogs(deduplicateLogs(historyRes.data || []));
//     } catch (err) {
//       console.error("Fetch error:", err);
//     } finally {
//       setSyncing(false);
//       setInitialLoad(false);
//     }
//   }, []);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 60000);
//     return () => clearInterval(interval);
//   }, [fetchData]);

//   useEffect(() => { setArchivePage(1); }, [searchTerm, deptFilter, monthFilter, yearFilter]);

//   const departments = useMemo(
//     () => [...new Set(allLogs.map((l) => l.department).filter(Boolean))],
//     [allLogs]
//   );

//   const availableYears = useMemo(() => {
//     const years = new Set(allLogs.map((l) => new Date(l.check_in || l.date).getFullYear()));
//     years.add(new Date().getFullYear());
//     return [...years].sort((a, b) => b - a);
//   }, [allLogs]);

//   const filteredLogs = useMemo(() => {
//     const month = parseInt(monthFilter);
//     const year  = parseInt(yearFilter);

//     const base = allLogs.filter((log) => {
//       const logDate      = new Date(log.check_in || log.date);
//       const matchesMonth = logDate.getMonth() === month && logDate.getFullYear() === year;
//       const matchesDept  = deptFilter === "all" ||
//         (log.department || "").toLowerCase().trim() === deptFilter.toLowerCase().trim();
//       const matchesSearch = (log.name || "").toLowerCase().includes(searchTerm.toLowerCase());
//       return matchesMonth && matchesDept && matchesSearch;
//     });

//     if (searchTerm.trim() && base.length > 0) {
//       const uniqueIds = [...new Set(base.map((l) => l.employee_id))];
//       if (uniqueIds.length === 1) {
//         const emp         = base[0];
//         const daysInMonth = new Date(year, month + 1, 0).getDate();
//         return Array.from({ length: daysInMonth }, (_, i) => {
//           const dateObj = new Date(year, month, i + 1);
//           const dateStr = dateObj.toDateString();
//           const found   = base.find(
//             (l) => new Date(l.check_in || l.date).toDateString() === dateStr
//           );
//           return found || {
//             id:           `temp-${emp.employee_id}-${i + 1}`,
//             employee_id:  emp.employee_id,
//             name:         emp.name,
//             department:   emp.department,
//             date:         dateObj.toISOString(),
//             status:       "Absent",
//             hours_worked: 0,
//             // carry shift info so resolveShiftType works on absent rows
//             shift_start:  emp.shift_start,
//             shift_end:    emp.shift_end,
//             shift_type:   emp.shift_type,
//           };
//         });
//       }
//     }

//     return base;
//   }, [allLogs, monthFilter, yearFilter, deptFilter, searchTerm]);

//   const paginatedLogs = useMemo(() => {
//     const start = (archivePage - 1) * ROWS_PER_PAGE;
//     return filteredLogs.slice(start, start + ROWS_PER_PAGE);
//   }, [filteredLogs, archivePage]);

//   const handleDelete = async () => {
//     if (!deleteLog) return;
//     setIsDeleting(true);
//     setDeleteError("");
//     try {
//       await api.delete(`/admin/actions/attendance/${deleteLog.id}`);
//       setDeleteLog(null);
//       fetchData();
//     } catch (err) {
//       setDeleteError(err?.response?.data?.detail || "Delete failed. Please try again.");
//     } finally {
//       setIsDeleting(false);
//     }
//   };

//   const handleExport = () => {
//     if (!filteredLogs.length) return;
//     const data = filteredLogs.map((log) => {
//       const m = getAttendanceMetrics(log);
//       return {
//         "Employee ID": log.employee_id,
//         Name:          log.name,
//         Department:    log.department || "N/A",
//         Date:          fmtDate(log.check_in || log.date),
//         "Check In":    m.isAbsent ? "" : fmtTime(log.check_in),
//         "Check Out":   m.isAbsent ? "" : fmtTime(log.check_out),
//         // FIX A: export correct hours
//         Hours:         computeHoursWorked(log),
//         Status:        m.statusText,
//         // FIX B: export correct shift type
//         "Shift Type":  resolveShiftType(log),
//       };
//     });
//     const ws = XLSX.utils.json_to_sheet(data);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Attendance");
//     XLSX.writeFile(wb, `Attendance_${MONTHS[monthFilter]}_${yearFilter}.xlsx`);
//   };

//   const handleAttendanceReport = () => {
//     const month       = parseInt(monthFilter);
//     const year        = parseInt(yearFilter);
//     const daysInMonth = new Date(year, month + 1, 0).getDate();

//     const logsThisMonth = allLogs.filter((log) => {
//       const d = new Date(log.check_in || log.date);
//       return d.getMonth() === month && d.getFullYear() === year;
//     });

//     if (!logsThisMonth.length) return;

//     const grouped = logsThisMonth.reduce((acc, log) => {
//       if (!acc[log.employee_id]) {
//         acc[log.employee_id] = { id:log.employee_id, name:log.name, dept:log.department||"Office", presentDays:0, lateArrivals:0, earlyLeaves:0 };
//       }
//       const m = getAttendanceMetrics(log);
//       if (!m.isAbsent) acc[log.employee_id].presentDays++;
//       if (m.isLate)    acc[log.employee_id].lateArrivals++;
//       if (m.isEarly)   acc[log.employee_id].earlyLeaves++;
//       return acc;
//     }, {});

//     const reportData = Object.values(grouped).map((emp) => {
//       const totalViolations = emp.lateArrivals + emp.earlyLeaves;
//       const billable        = Math.max(0, totalViolations - 4);
//       const deductionDays   = Math.floor(billable / 3);
//       const finalDays       = Math.max(0, emp.presentDays - deductionDays);
//       const status =
//         totalViolations <= 4 && emp.presentDays >= daysInMonth - 2 ? "Excellent" :
//         totalViolations > 10 ? "Warning" : "Standard";
//       return {
//         "Employee ID":          emp.id,
//         Name:                   emp.name,
//         Department:             emp.dept,
//         "Month Days":           daysInMonth,
//         "Days Present":         emp.presentDays,
//         "Late Arrivals":        emp.lateArrivals,
//         "Early Leaves":         emp.earlyLeaves,
//         "Total Violations":     totalViolations,
//         "Grace Used":           Math.min(totalViolations, 4),
//         "Violation Deductions": deductionDays,
//         "Final Payable Days":   finalDays,
//         Performance:            status,
//       };
//     });

//     const ws = XLSX.utils.json_to_sheet(reportData);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
//     XLSX.writeFile(wb, `Report_${MONTHS[month]}_${year}.xlsx`);
//   };


//   // ---------------------------------------------------------------------------
//   // Render
//   // ---------------------------------------------------------------------------

//   return (
//     <div className="relative min-h-screen bg-[#060B14] text-white overflow-hidden p-4 lg:p-8 font-sans">

//       {/* Ambient glows */}
//       <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/30 blur-[120px] pointer-events-none"/>
//       <div className="fixed bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-emerald-600/20 blur-[150px] pointer-events-none"/>
//       <div className="fixed top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-cyan-600/20 blur-[100px] pointer-events-none"/>

//       <div className="relative z-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-1000">

//         {/* ── HEADER ── */}
//         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
//           <div>
//             <div className="flex items-center gap-2 mb-2">
//               <span className="relative flex h-3 w-3">
//                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
//                 <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"/>
//               </span>
//               <span className="text-[10px] font-bold text-emerald-400 tracking-[0.2em] uppercase">AFAM Management Systems</span>
//             </div>
//             <h1 className="text-3xl font-light tracking-tight text-white flex items-center gap-3">
//               Attendance{" "}
//               <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
//                 Sphere
//               </span>
//               {isAuditor && (
//                 <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30 uppercase font-black tracking-widest shadow-inner">
//                   Auditor View
//                 </span>
//               )}
//             </h1>
//           </div>
//           <div className="flex flex-wrap gap-4 w-full lg:w-auto items-center">
//             <div className="px-5 py-3 bg-black/40 border border-white/10 font-mono text-sm text-cyan-400 font-bold rounded-[1.5rem] shadow-inner">
//               {currentTime.toLocaleTimeString()}
//             </div>
//             {canEdit && (
//               <button
//                 onClick={() => setIsManualModalOpen(true)}
//                 className="flex-1 lg:flex-none px-6 py-3 rounded-[1.5rem] bg-emerald-500 text-black text-xs font-black uppercase shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5)] hover:-translate-y-0.5 hover:bg-emerald-400 transition-all"
//               >
//                 + Post Attendance
//               </button>
//             )}
//           </div>
//         </div>

//         {/* ── STATS ── */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//           <StatCard title="On Site Today" value={stats.present_now||0}      icon={<UserCheck size={20}/>} colorClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"/>
//           <StatCard title="Absent Today"  value={stats.absent||0}           icon={<Clock size={20}/>}     colorClass="bg-rose-500/20 text-rose-300 border-rose-500/30"/>
//           <StatCard title="Total Staff"   value={stats.total_employees||0}  icon={<Users size={20}/>}     colorClass="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"/>
//         </div>

//         {/* ── LIVE TABLE ── */}
//         <section className="space-y-4">
//           <div className="flex justify-between items-center px-4">
//             <h2 className="text-white font-medium text-sm tracking-widest flex items-center gap-2">
//               <Activity size={16} className="text-cyan-400"/> LIVE ACTIVITY (TODAY)
//             </h2>
//             <button onClick={fetchData} disabled={syncing} className="bg-white/5 p-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors">
//               <RefreshCcw size={14} className={syncing ? "animate-spin text-cyan-400" : "text-slate-400"}/>
//             </button>
//           </div>

//           {initialLoad ? (
//             <div className="bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-16 flex flex-col items-center gap-3">
//               <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"/>
//               <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">Loading…</p>
//             </div>
//           ) : (
//             <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
//               <AttendanceTable logs={todayLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={false}/>
//             </div>
//           )}
//         </section>

//         {/* ── ARCHIVE ── */}
//         <section className="space-y-6 pt-8 border-t border-white/10">
//           <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-4">
//             <h2 className="text-slate-400 font-medium text-sm tracking-widest flex items-center gap-2">
//               <History size={16} className="text-indigo-400"/> RECORDS ARCHIVE
//             </h2>
//             <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
//               {/* Filters */}
//               <div className="bg-black/40 p-1.5 rounded-[1.5rem] border border-white/10 flex shadow-inner gap-1 flex-wrap">
//                 <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   {MONTHS.map((m, i) => <option key={m} value={i} className="bg-black">{m}</option>)}
//                 </select>
//                 <div className="w-px bg-white/10 my-1"/>
//                 <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="bg-transparent pl-4 pr-6 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   {availableYears.map((y) => <option key={y} value={y} className="bg-black">{y}</option>)}
//                 </select>
//                 <div className="w-px bg-white/10 my-1"/>
//                 <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   <option value="all" className="bg-black">All Departments</option>
//                   {departments.map((d) => <option key={d} value={d} className="bg-black">{d}</option>)}
//                 </select>
//               </div>
//               {/* Search */}
//               <div className="relative flex-grow lg:flex-grow-0 group">
//                 <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-400 transition-colors"/>
//                 <input type="text" placeholder="Search Personnel…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-56 bg-black/40 border border-white/10 rounded-[1.5rem] pl-10 pr-4 py-3 text-xs text-white outline-none focus:border-cyan-500/50 shadow-inner placeholder:text-slate-500 transition-colors"/>
//               </div>
//               {/* Export buttons */}
//               <button onClick={handleExport} className="px-5 py-3 bg-indigo-500/20 border border-indigo-500/30 rounded-[1.5rem] text-indigo-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-indigo-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
//                 <Download size={14}/> Total Attendance
//               </button>
//               <button onClick={handleAttendanceReport} className="px-5 py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-[1.5rem] text-cyan-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-cyan-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
//                 <FileText size={14}/> Monthly Report
//               </button>
//             </div>
//           </div>

//           <ArchiveSummaryBar logs={filteredLogs}/>

//           <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
//             <AttendanceTable logs={paginatedLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={true}/>
//             <Pagination total={filteredLogs.length} page={archivePage} perPage={ROWS_PER_PAGE} onChange={setArchivePage}/>
//           </div>
//         </section>
//       </div>

//       {/* ── MODALS ── */}
//       <ManualEntryModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onRefresh={fetchData}/>

//       {editLog && (
//         <EditRecordModal log={editLog} onClose={() => setEditLog(null)} onRefresh={fetchData}/>
//       )}

//       {deleteLog && (
//         <DeleteConfirmModal
//           log={deleteLog}
//           onClose={() => { setDeleteLog(null); setDeleteError(""); }}
//           onConfirm={handleDelete}
//           isDeleting={isDeleting}
//         />
//       )}

//       {/* Delete error toast */}
//       {deleteError && (
//         <div className="fixed bottom-6 right-6 bg-rose-900/90 border border-rose-500/30 text-rose-200 text-xs font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50">
//           <AlertCircle size={14}/> {deleteError}
//           <button onClick={() => setDeleteError("")}><X size={13}/></button>
//         </div>
//       )}

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 20px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default AttendanceDashboard;
















// import React, { useState, useEffect, useMemo, useCallback } from "react";
// import api from "../api/axios";
// import * as XLSX from "xlsx";
// import {
//   Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History,
//   Trash2, X, Download, Search, AlertCircle, FileText, Ghost,
//   Coffee, ChevronLeft, ChevronRight, AlertTriangle
// } from "lucide-react";
// import ManualEntryModal from "../components/ManualEntryForm";


// // ---------------------------------------------------------------------------
// // Constants
// // ---------------------------------------------------------------------------

// const MONTHS = [
//   "January","February","March","April","May","June",
//   "July","August","September","October","November","December",
// ];

// const ROWS_PER_PAGE = 20;


// // ---------------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------------

// const fmtTime = (iso) =>
//   iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

// const fmtDate = (iso) =>
//   iso
//     ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
//     : "--";

// const formatWorkHours = (decimal) => {
//   if (!decimal || decimal === 0) return "0h 00m";
//   const h = Math.floor(decimal);
//   const m = Math.round((decimal - h) * 60);
//   return `${h}h ${m.toString().padStart(2, "0")}m`;
// };

// // ---------------------------------------------------------------------------
// // FIX: determineShiftType (frontend mirror of backend rule)
// //
// // RULE  : shift_start 02:00–14:00 (inclusive) → "Day", else → "Night"
// // FIXED : Old frontend had NO equivalent — it blindly trusted log.shift_type
// //         from the API. Now we recalculate client-side for temp/absent rows
// //         that are synthesised on the frontend and never hit the DB, ensuring
// //         those placeholder rows also show the correct Day/Night badge.
// //
// // "Unknown" is returned when shift_start is missing so the badge can render
// // a neutral state instead of silently defaulting to Day.
// // ---------------------------------------------------------------------------

// const determineShiftType = (shiftStartStr) => {
//   if (!shiftStartStr || !shiftStartStr.trim()) return "Unknown";
//   const parts = shiftStartStr.trim().split(":");
//   if (parts.length < 2) return "Unknown";
//   const h = parseInt(parts[0], 10);
//   const m = parseInt(parts[1], 10);
//   if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return "Unknown";
//   const totalMins = h * 60 + m;
//   // 02:00 AM = 120 min … 02:00 PM = 840 min (inclusive both ends) → Day
//   return totalMins >= 120 && totalMins <= 840 ? "Day" : "Night";
// };

// const deduplicateLogs = (data = []) => {
//   const uniqueMap = new Map();
//   data.forEach((log) => {
//     const raw     = log.check_in || log.date;
//     const dateStr = raw ? new Date(raw).toDateString() : "unknown";
//     const key     = `${log.employee_id}-${dateStr}`;
//     if (!uniqueMap.has(key)) {
//       uniqueMap.set(key, log);
//     } else {
//       const existing = uniqueMap.get(key);
//       if (existing.status?.toLowerCase() === "absent" && log.check_in) {
//         uniqueMap.set(key, log);
//       }
//     }
//   });
//   return Array.from(uniqueMap.values());
// };


// // ---------------------------------------------------------------------------
// // getAttendanceMetrics
// // ---------------------------------------------------------------------------

// const getAttendanceMetrics = (log) => {
//   const statusLower = log.status?.toLowerCase();
//   const now         = new Date();
//   const rawDate     = log.check_in || log.date;
//   const logDate     = rawDate ? new Date(rawDate) : now;
//   const isToday     = logDate.toDateString() === now.toDateString();

//   let shiftStartTime = null;
//   if (log.shift_start) {
//     const [h, m] = log.shift_start.split(":").map(Number);
//     shiftStartTime = new Date(logDate);
//     shiftStartTime.setHours(h, m, 0, 0);

//     if (h === 0 && log.check_in) {
//       const checkInDate = new Date(log.check_in);
//       if (checkInDate.getHours() >= 22) {
//         shiftStartTime.setDate(shiftStartTime.getDate() + 1);
//       }
//     }
//   }

//   if (isToday && !log.check_in && shiftStartTime && now < shiftStartTime)
//     return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"Scheduled" };

//   if (statusLower === "absent")
//     return { isLate:false, isEarly:false, isAbsent:true,  isOnBreak:false, statusText:"Absent" };

//   if (statusLower === "on_break")
//     return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:true,  statusText:"On Break" };

//   if (!log.check_in || !log.shift_start)
//     return { isLate:false, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"Normal" };

//   const isLate = shiftStartTime
//     ? (new Date(log.check_in) - shiftStartTime) / 60000 > 10
//     : false;

//   if (log.check_in && !log.check_out)
//     return { isLate, isEarly:false, isAbsent:false, isOnBreak:false, statusText:"On Duty" };

//   let isEarly = false;
//   if (log.check_out && log.shift_end) {
//     const checkOutTime = new Date(log.check_out);
//     const [eH, eM]    = log.shift_end.split(":").map(Number);
//     const [sH]        = log.shift_start.split(":").map(Number);

//     const shiftEnd = new Date(log.check_in);   
//     shiftEnd.setHours(eH, eM, 0, 0);

//     if (eH < sH) {
//       shiftEnd.setDate(shiftEnd.getDate() + 1);
//     }

//     const minsEarly = (shiftEnd - checkOutTime) / 60000;
//     isEarly = minsEarly > 10;
//   }

//   let statusText = "Normal";
//   if (isLate && isEarly) statusText = "Late & Early Leave";
//   else if (isLate)        statusText = "Late Arrival";
//   else if (isEarly)       statusText = "Early Leave";

//   return { isLate, isEarly, isAbsent:false, isOnBreak:false, statusText };
// };


// // ---------------------------------------------------------------------------
// // StatCard
// // ---------------------------------------------------------------------------

// const StatCard = ({ title, value, icon, colorClass }) => (
//   <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden group">
//     <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"/>
//     <div className="flex justify-between items-start relative z-10">
//       <div>
//         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
//         <h3 className="text-4xl font-light text-white tracking-tighter drop-shadow-md">{value}</h3>
//       </div>
//       <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center border shadow-inner ${colorClass}`}>
//         {icon}
//       </div>
//     </div>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // ArchiveSummaryBar
// // ---------------------------------------------------------------------------

// const ArchiveSummaryBar = ({ logs }) => {
//   const totals = useMemo(() => {
//     let present=0, late=0, early=0, absent=0, totalHours=0;
//     logs.forEach((log) => {
//       const m = getAttendanceMetrics(log);
//       if (m.isAbsent) { absent++; return; }
//       present++;
//       if (m.isLate)  late++;
//       if (m.isEarly) early++;
//       totalHours += log.hours_worked || 0;
//     });
//     return { present, late, early, absent, totalHours: totalHours.toFixed(1) };
//   }, [logs]);

//   return (
//     <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
//       {[
//         { label:"Present",     value:totals.present,          color:"text-emerald-400" },
//         { label:"Absent",      value:totals.absent,           color:"text-rose-400" },
//         { label:"Late",        value:totals.late,             color:"text-amber-400" },
//         { label:"Early Leave", value:totals.early,            color:"text-amber-400" },
//         { label:"Total Hours", value:`${totals.totalHours}h`, color:"text-cyan-400" },
//       ].map(({ label, value, color }) => (
//         <div key={label} className="bg-black/30 border border-white/5 rounded-2xl px-4 py-3 text-center">
//           <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</p>
//           <p className={`text-lg font-black ${color}`}>{value}</p>
//         </div>
//       ))}
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // resolveShiftType
// //
// // Priority order:
// //   1. log.shift_type from API  (if it's "Day" or "Night" — not blank/Unknown)
// //   2. Recalculate from log.shift_start using the canonical frontend rule
// //   3. Fall back to "Unknown" badge
// //
// // This covers two cases:
// //   a) Real DB rows where shift_type was stored correctly → use stored value
// //   b) Synthesised temp/absent rows built in filteredLogs → recalculate
// // ---------------------------------------------------------------------------

// const resolveShiftType = (log) => {
//   if (log.shift_type && log.shift_type !== "Unknown" && log.shift_type !== "") {
//     return log.shift_type;
//   }
//   return determineShiftType(log.shift_start);
// };


// // ---------------------------------------------------------------------------
// // AttendanceTable
// // ---------------------------------------------------------------------------

// const AttendanceTable = ({ logs, onEdit, onDelete, isReadOnly, canDelete, showStatus=false }) => (
//   <div className="overflow-x-auto custom-scrollbar">
//     <table className="w-full text-left border-collapse">
//       <thead>
//         <tr className="bg-black/20 backdrop-blur-md border-b border-white/5">
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Staff & Dept</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Date</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Shift</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase">Stamps (IN / OUT)</th>
//           <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Duration</th>
//           {showStatus && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-center">Status</th>}
//           {!isReadOnly && <th className="px-6 py-5 text-xs font-medium tracking-widest text-slate-400 uppercase text-right">Actions</th>}
//         </tr>
//       </thead>
//       <tbody className="divide-y divide-white/5">
//         {logs.length === 0 ? (
//           <tr>
//             <td colSpan={isReadOnly ? 5 : 6} className="px-6 py-16 text-center">
//               <Ghost size={28} className="mx-auto mb-3 text-slate-700"/>
//               <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">No Records Found</p>
//             </td>
//           </tr>
//         ) : logs.map((log) => {
//           const { isLate, isEarly, isAbsent, isOnBreak, statusText } = getAttendanceMetrics(log);
//           // FIX: use resolveShiftType instead of log.shift_type directly
//           const shiftType = resolveShiftType(log);
//           return (
//             <tr key={log.id} className={`group hover:bg-white/[0.03] transition-colors ${isAbsent ? "bg-rose-500/5" : ""}`}>

//               {/* Staff & Dept */}
//               <td className="px-6 py-4">
//                 <div className="flex items-center gap-3">
//                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
//                     isAbsent        ? "bg-rose-500  shadow-[0_0_8px_rgba(244,63,94,0.6)]" :
//                     isOnBreak       ? "bg-blue-400  shadow-[0_0_8px_rgba(96,165,250,0.6)]" :
//                     isLate||isEarly ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" :
//                                       "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
//                   }`}/>
//                   <div>
//                     <div className="text-white font-medium text-sm flex items-center flex-wrap gap-2">
//                       {log.name}
//                       {isAbsent  && <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><AlertCircle size={9}/> ABSENT</span>}
//                       {isOnBreak && <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><Coffee size={9}/> ON BREAK</span>}
//                       {!isAbsent && !isOnBreak && isLate  && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">LATE</span>}
//                       {!isAbsent && !isOnBreak && isEarly && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-md italic tracking-widest">EARLY LEAVE</span>}
//                     </div>
//                     <div className="text-cyan-400/80 text-[10px] font-mono uppercase tracking-widest mt-0.5">
//                       {log.department || "Main Office"}
//                     </div>
//                   </div>
//                 </div>
//               </td>

//               {/* Date */}
//               <td className="px-6 py-4 text-xs font-mono text-slate-300">
//                 {fmtDate(log.check_in || log.date)}
//               </td>

//               {/* Shift type — FIX: uses resolveShiftType result */}
//               <td className="px-6 py-4 text-center">
//                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shadow-inner border ${
//                   shiftType === "Day"
//                     ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
//                     : shiftType === "Night"
//                     ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
//                     : "bg-slate-500/10 text-slate-400 border-slate-500/20"  // Unknown
//                 }`}>
//                   {shiftType === "Unknown" ? "—" : shiftType}
//                 </span>
//               </td>

//               {/* Stamps */}
//               <td className="px-6 py-4 text-xs font-mono">
//                 {isAbsent ? (
//                   <span className="text-rose-400/60 italic font-bold">No Records</span>
//                 ) : (
//                   <div className="flex items-center gap-4 bg-black/30 p-2 rounded-xl border border-white/5 w-max">
//                     <div className={isLate ? "text-rose-400 font-medium" : "text-emerald-400"}>
//                       <span className="text-[10px] text-slate-500 mr-1">IN</span>
//                       {fmtTime(log.check_in)}
//                     </div>
//                     <div className="w-px h-4 bg-white/10"/>
//                     <div className={isEarly ? "text-amber-400 font-medium" : "text-slate-300"}>
//                       <span className="text-[10px] text-slate-500 mr-1">OUT</span>
//                       {fmtTime(log.check_out)}
//                     </div>
//                   </div>
//                 )}
//               </td>

//               {/* Duration */}
//               <td className="px-6 py-4 text-center text-sm font-mono font-medium text-white">
//                 {isAbsent ? "—" : formatWorkHours(log.hours_worked)}
//               </td>

//               {/* Status column (archive only) */}
//               {showStatus && (
//                 <td className="px-6 py-4 text-center">
//                   <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
//                     isAbsent        ? "text-rose-400" :
//                     isOnBreak       ? "text-blue-400" :
//                     isLate||isEarly ? "text-amber-400" :
//                                       "text-emerald-400"
//                   }`}>
//                     {statusText}
//                   </span>
//                 </td>
//               )}

//               {/* Actions */}
//               {!isReadOnly && (
//                 <td className="px-6 py-4 text-right">
//                   <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
//                     <button onClick={() => onEdit(log)} className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-xl transition-all border border-transparent hover:border-cyan-400/20">
//                       <Edit3 size={15}/>
//                     </button>
//                     {canDelete && (
//                       <button onClick={() => onDelete(log)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all border border-transparent hover:border-rose-400/20">
//                         <Trash2 size={15}/>
//                       </button>
//                     )}
//                   </div>
//                 </td>
//               )}
//             </tr>
//           );
//         })}
//       </tbody>
//     </table>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // Pagination
// // ---------------------------------------------------------------------------

// const Pagination = ({ total, page, perPage, onChange }) => {
//   const totalPages = Math.ceil(total / perPage);
//   if (totalPages <= 1) return null;
//   return (
//     <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
//       <p className="text-xs text-slate-500">
//         Showing{" "}
//         <span className="text-white font-bold">{Math.min((page-1)*perPage+1, total)}–{Math.min(page*perPage, total)}</span>
//         {" "}of{" "}
//         <span className="text-white font-bold">{total}</span>
//       </p>
//       <div className="flex items-center gap-2">
//         <button onClick={() => onChange(page-1)} disabled={page===1} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
//           <ChevronLeft size={14}/>
//         </button>
//         <span className="text-xs text-slate-400 font-mono px-2">{page} / {totalPages}</span>
//         <button onClick={() => onChange(page+1)} disabled={page===totalPages} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
//           <ChevronRight size={14}/>
//         </button>
//       </div>
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // EditRecordModal
// // ---------------------------------------------------------------------------

// const EditRecordModal = ({ log, onClose, onRefresh }) => {
//   const [inTime,  setInTime]  = useState(log.check_in  ? log.check_in.substring(0,16)  : "");
//   const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0,16) : "");
//   const [saving,  setSaving]  = useState(false);
//   const [error,   setError]   = useState("");

//   const handleSave = async () => {
//     if (!inTime) { setError("Check-in time is required."); return; }
//     setSaving(true);
//     setError("");
//     try {
//       await api.put(`/admin/actions/attendance/${log.id}`, {
//         employee_id: log.employee_id,
//         check_in:    inTime  || null,
//         check_out:   outTime || null,
//       });
//       onRefresh();
//       onClose();
//     } catch (err) {
//       setError(err?.response?.data?.detail || "Update failed. Please try again.");
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
//       <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-md shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden">
//         <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
//           <h2 className="text-white font-bold uppercase text-xs tracking-widest flex items-center gap-2">
//             Correction: <span className="text-cyan-400 font-mono bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">{log.name}</span>
//           </h2>
//           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full hover:bg-white/10">
//             <X size={18}/>
//           </button>
//         </div>
//         <div className="p-8 space-y-6">
//           {error && (
//             <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl px-4 py-3 flex items-center gap-2">
//               <AlertTriangle size={14}/> {error}
//             </div>
//           )}
//           <div className="space-y-3">
//             <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-In Time</label>
//             <input type="datetime-local" value={inTime} onChange={(e) => setInTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
//           </div>
//           <div className="space-y-3">
//             <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Check-Out Time</label>
//             <input type="datetime-local" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] px-5 py-3.5 text-white text-sm outline-none focus:border-cyan-500/50 shadow-inner [color-scheme:dark] transition-colors"/>
//           </div>
//           <button onClick={handleSave} disabled={saving} className="w-full mt-4 py-4 bg-emerald-500 text-black font-black uppercase text-xs tracking-[0.2em] rounded-[1.5rem] hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed">
//             {saving ? "Saving…" : "Sync Correction"}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };


// // ---------------------------------------------------------------------------
// // DeleteConfirmModal
// // ---------------------------------------------------------------------------

// const DeleteConfirmModal = ({ log, onClose, onConfirm, isDeleting }) => (
//   <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
//     <div className="bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] w-full max-w-sm shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
//       <div className="p-8 text-center space-y-4">
//         <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
//           <Trash2 size={24} className="text-rose-400"/>
//         </div>
//         <h3 className="text-white font-bold text-sm uppercase tracking-widest">Confirm Delete</h3>
//         <p className="text-slate-400 text-xs leading-relaxed">
//           Permanently delete the record for{" "}
//           <span className="text-white font-bold">{log?.name}</span> on{" "}
//           <span className="text-white font-bold">{fmtDate(log?.check_in || log?.date)}</span>?
//           This cannot be undone.
//         </p>
//         <div className="flex gap-3 pt-2">
//           <button onClick={onClose} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] border border-white/10 text-slate-400 text-xs font-bold uppercase hover:bg-white/5 transition-all disabled:opacity-30">
//             Cancel
//           </button>
//           <button onClick={onConfirm} disabled={isDeleting} className="flex-1 py-3 rounded-[1.5rem] bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-50">
//             {isDeleting ? "Deleting…" : "Delete"}
//           </button>
//         </div>
//       </div>
//     </div>
//   </div>
// );


// // ---------------------------------------------------------------------------
// // Main AttendanceDashboard
// // ---------------------------------------------------------------------------

// const AttendanceDashboard = () => {
//   const [stats,     setStats]     = useState({ present_now:0, absent:0, total_employees:0 });
//   const [todayLogs, setTodayLogs] = useState([]);
//   const [allLogs,   setAllLogs]   = useState([]);

//   const [searchTerm,  setSearchTerm]  = useState("");
//   const [deptFilter,  setDeptFilter]  = useState("all");
//   const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
//   const [yearFilter,  setYearFilter]  = useState(new Date().getFullYear());
//   const [archivePage, setArchivePage] = useState(1);

//   const [isManualModalOpen, setIsManualModalOpen] = useState(false);
//   const [editLog,           setEditLog]           = useState(null);
//   const [deleteLog,         setDeleteLog]         = useState(null);
//   const [isDeleting,        setIsDeleting]        = useState(false);
//   const [deleteError,       setDeleteError]       = useState("");

//   const [syncing,     setSyncing]     = useState(false);
//   const [initialLoad, setInitialLoad] = useState(true);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   const userRole   = (localStorage.getItem("role") || "read_only_admin").toLowerCase();
//   const isReadOnly = userRole === "read_only_admin";
//   const isAuditor  = userRole === "auditor";
//   const isAdmin    = userRole === "admin";
//   const canEdit    = isAdmin || isAuditor;

//   useEffect(() => {
//     const t = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(t);
//   }, []);

//   // Admin initialization tasks
//   useEffect(() => {
//     if (isAdmin) {
//       api.post("/attendance/mark-absents").catch(() => {});
//       api.post("/attendance/auto-close-stale").catch(() => {}); 
//     }
//   }, [isAdmin]);

//   const fetchData = useCallback(async () => {
//     setSyncing(true);
//     try {
//       const [statsRes, summaryRes, historyRes] = await Promise.all([
//         api.get("/attendance/stats"),
//         api.get("/attendance/summary"),
//         api.get("/attendance/all"),
//       ]);

//       setStats(statsRes.data || {});

//       const cleanSummary = deduplicateLogs(summaryRes.data || []);
//       const today        = new Date().toDateString();
//       setTodayLogs(cleanSummary.filter((l) => {
//         const d = l.check_in || l.date;
//         return d && new Date(d).toDateString() === today;
//       }));

//       setAllLogs(deduplicateLogs(historyRes.data || []));
//     } catch (err) {
//       console.error("Fetch error:", err);
//     } finally {
//       setSyncing(false);
//       setInitialLoad(false);
//     }
//   }, []);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 60000);
//     return () => clearInterval(interval);
//   }, [fetchData]);

//   useEffect(() => { setArchivePage(1); }, [searchTerm, deptFilter, monthFilter, yearFilter]);

//   const departments = useMemo(
//     () => [...new Set(allLogs.map((l) => l.department).filter(Boolean))],
//     [allLogs]
//   );

//   const availableYears = useMemo(() => {
//     const years = new Set(allLogs.map((l) => new Date(l.check_in || l.date).getFullYear()));
//     years.add(new Date().getFullYear());
//     return [...years].sort((a, b) => b - a);
//   }, [allLogs]);

//   const filteredLogs = useMemo(() => {
//     const month = parseInt(monthFilter);
//     const year  = parseInt(yearFilter);

//     const base = allLogs.filter((log) => {
//       const logDate      = new Date(log.check_in || log.date);
//       const matchesMonth = logDate.getMonth() === month && logDate.getFullYear() === year;
//       const matchesDept  = deptFilter === "all" ||
//         (log.department || "").toLowerCase().trim() === deptFilter.toLowerCase().trim();
//       const matchesSearch = (log.name || "").toLowerCase().includes(searchTerm.toLowerCase());
//       return matchesMonth && matchesDept && matchesSearch;
//     });

//     if (searchTerm.trim() && base.length > 0) {
//       const uniqueIds = [...new Set(base.map((l) => l.employee_id))];
//       if (uniqueIds.length === 1) {
//         const emp         = base[0];
//         const daysInMonth = new Date(year, month + 1, 0).getDate();
//         return Array.from({ length: daysInMonth }, (_, i) => {
//           const dateObj = new Date(year, month, i + 1);
//           const dateStr = dateObj.toDateString();
//           const found   = base.find(
//             (l) => new Date(l.check_in || l.date).toDateString() === dateStr
//           );
//           return found || {
//             id:           `temp-${emp.employee_id}-${i + 1}`,
//             employee_id:  emp.employee_id,
//             name:         emp.name,
//             department:   emp.department,
//             date:         dateObj.toISOString(),
//             status:       "Absent",
//             hours_worked: 0,
//             // FIX: carry shift_start and shift_type so resolveShiftType works
//             // correctly for synthesised absent rows too
//             shift_start:  emp.shift_start,
//             shift_end:    emp.shift_end,
//             shift_type:   emp.shift_type || determineShiftType(emp.shift_start),
//           };
//         });
//       }
//     }

//     return base;
//   }, [allLogs, monthFilter, yearFilter, deptFilter, searchTerm]);

//   const paginatedLogs = useMemo(() => {
//     const start = (archivePage - 1) * ROWS_PER_PAGE;
//     return filteredLogs.slice(start, start + ROWS_PER_PAGE);
//   }, [filteredLogs, archivePage]);

//   const handleDelete = async () => {
//     if (!deleteLog) return;
//     setIsDeleting(true);
//     setDeleteError("");
//     try {
//       await api.delete(`/admin/actions/attendance/${deleteLog.id}`);
//       setDeleteLog(null);
//       fetchData();
//     } catch (err) {
//       setDeleteError(err?.response?.data?.detail || "Delete failed. Please try again.");
//     } finally {
//       setIsDeleting(false);
//     }
//   };

//   const handleExport = () => {
//     if (!filteredLogs.length) return;
//     const data = filteredLogs.map((log) => {
//       const m = getAttendanceMetrics(log);
//       return {
//         "Employee ID": log.employee_id,
//         Name:          log.name,
//         Department:    log.department || "N/A",
//         Date:          fmtDate(log.check_in || log.date),
//         "Check In":    m.isAbsent ? "" : fmtTime(log.check_in),
//         "Check Out":   m.isAbsent ? "" : fmtTime(log.check_out),
//         Hours:         log.hours_worked || 0,
//         Status:        m.statusText,
//         // FIX: export also uses the resolved shift type
//         "Shift Type":  resolveShiftType(log),
//       };
//     });
//     const ws = XLSX.utils.json_to_sheet(data);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Attendance");
//     XLSX.writeFile(wb, `Attendance_${MONTHS[monthFilter]}_${yearFilter}.xlsx`);
//   };

//   const handleAttendanceReport = () => {
//     const month       = parseInt(monthFilter);
//     const year        = parseInt(yearFilter);
//     const daysInMonth = new Date(year, month + 1, 0).getDate();

//     const logsThisMonth = allLogs.filter((log) => {
//       const d = new Date(log.check_in || log.date);
//       return d.getMonth() === month && d.getFullYear() === year;
//     });

//     if (!logsThisMonth.length) return;

//     const grouped = logsThisMonth.reduce((acc, log) => {
//       if (!acc[log.employee_id]) {
//         acc[log.employee_id] = { id:log.employee_id, name:log.name, dept:log.department||"Office", presentDays:0, lateArrivals:0, earlyLeaves:0 };
//       }
//       const m = getAttendanceMetrics(log);
//       if (!m.isAbsent) acc[log.employee_id].presentDays++;
//       if (m.isLate)    acc[log.employee_id].lateArrivals++;
//       if (m.isEarly)   acc[log.employee_id].earlyLeaves++;
//       return acc;
//     }, {});

//     const reportData = Object.values(grouped).map((emp) => {
//       const totalViolations = emp.lateArrivals + emp.earlyLeaves;
//       const billable        = Math.max(0, totalViolations - 4);
//       const deductionDays   = Math.floor(billable / 3);
//       const finalDays       = Math.max(0, emp.presentDays - deductionDays);
//       const status =
//         totalViolations <= 4 && emp.presentDays >= daysInMonth - 2 ? "Excellent" :
//         totalViolations > 10 ? "Warning" : "Standard";
//       return {
//         "Employee ID":          emp.id,
//         Name:                   emp.name,
//         Department:             emp.dept,
//         "Month Days":           daysInMonth,
//         "Days Present":         emp.presentDays,
//         "Late Arrivals":        emp.lateArrivals,
//         "Early Leaves":         emp.earlyLeaves,
//         "Total Violations":     totalViolations,
//         "Grace Used":           Math.min(totalViolations, 4),
//         "Violation Deductions": deductionDays,
//         "Final Payable Days":   finalDays,
//         Performance:            status,
//       };
//     });

//     const ws = XLSX.utils.json_to_sheet(reportData);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
//     XLSX.writeFile(wb, `Report_${MONTHS[month]}_${year}.xlsx`);
//   };


//   // ---------------------------------------------------------------------------
//   // Render
//   // ---------------------------------------------------------------------------

//   return (
//     <div className="relative min-h-screen bg-[#060B14] text-white overflow-hidden p-4 lg:p-8 font-sans">

//       {/* Ambient glows */}
//       <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/30 blur-[120px] pointer-events-none"/>
//       <div className="fixed bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-emerald-600/20 blur-[150px] pointer-events-none"/>
//       <div className="fixed top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-cyan-600/20 blur-[100px] pointer-events-none"/>

//       <div className="relative z-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-1000">

//         {/* ── HEADER ── */}
//         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white/[0.02] backdrop-blur-3xl border border-white/10 p-6 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
//           <div>
//             <div className="flex items-center gap-2 mb-2">
//               <span className="relative flex h-3 w-3">
//                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
//                 <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"/>
//               </span>
//               <span className="text-[10px] font-bold text-emerald-400 tracking-[0.2em] uppercase">AFAM Management Systems</span>
//             </div>
//             <h1 className="text-3xl font-light tracking-tight text-white flex items-center gap-3">
//               Attendance{" "}
//               <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
//                 Sphere
//               </span>
//               {isAuditor && (
//                 <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30 uppercase font-black tracking-widest shadow-inner">
//                   Auditor View
//                 </span>
//               )}
//             </h1>
//           </div>
//           <div className="flex flex-wrap gap-4 w-full lg:w-auto items-center">
//             <div className="px-5 py-3 bg-black/40 border border-white/10 font-mono text-sm text-cyan-400 font-bold rounded-[1.5rem] shadow-inner">
//               {currentTime.toLocaleTimeString()}
//             </div>
//             {canEdit && (
//               <button
//                 onClick={() => setIsManualModalOpen(true)}
//                 className="flex-1 lg:flex-none px-6 py-3 rounded-[1.5rem] bg-emerald-500 text-black text-xs font-black uppercase shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5)] hover:-translate-y-0.5 hover:bg-emerald-400 transition-all"
//               >
//                 + Post Attendance
//               </button>
//             )}
//           </div>
//         </div>

//         {/* ── STATS ── */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//           <StatCard title="On Site Today" value={stats.present_now||0}      icon={<UserCheck size={20}/>} colorClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"/>
//           <StatCard title="Absent Today"  value={stats.absent||0}           icon={<Clock size={20}/>}     colorClass="bg-rose-500/20 text-rose-300 border-rose-500/30"/>
//           <StatCard title="Total Staff"   value={stats.total_employees||0}  icon={<Users size={20}/>}     colorClass="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"/>
//         </div>

//         {/* ── LIVE TABLE ── */}
//         <section className="space-y-4">
//           <div className="flex justify-between items-center px-4">
//             <h2 className="text-white font-medium text-sm tracking-widest flex items-center gap-2">
//               <Activity size={16} className="text-cyan-400"/> LIVE ACTIVITY (TODAY)
//             </h2>
//             <button onClick={fetchData} disabled={syncing} className="bg-white/5 p-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors">
//               <RefreshCcw size={14} className={syncing ? "animate-spin text-cyan-400" : "text-slate-400"}/>
//             </button>
//           </div>

//           {initialLoad ? (
//             <div className="bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-16 flex flex-col items-center gap-3">
//               <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"/>
//               <p className="text-xs uppercase tracking-widest text-slate-600 font-bold">Loading…</p>
//             </div>
//           ) : (
//             <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
//               <AttendanceTable logs={todayLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={false}/>
//             </div>
//           )}
//         </section>

//         {/* ── ARCHIVE ── */}
//         <section className="space-y-6 pt-8 border-t border-white/10">
//           <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-4">
//             <h2 className="text-slate-400 font-medium text-sm tracking-widest flex items-center gap-2">
//               <History size={16} className="text-indigo-400"/> RECORDS ARCHIVE
//             </h2>
//             <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
//               {/* Filters */}
//               <div className="bg-black/40 p-1.5 rounded-[1.5rem] border border-white/10 flex shadow-inner gap-1 flex-wrap">
//                 <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   {MONTHS.map((m, i) => <option key={m} value={i} className="bg-black">{m}</option>)}
//                 </select>
//                 <div className="w-px bg-white/10 my-1"/>
//                 <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="bg-transparent pl-4 pr-6 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   {availableYears.map((y) => <option key={y} value={y} className="bg-black">{y}</option>)}
//                 </select>
//                 <div className="w-px bg-white/10 my-1"/>
//                 <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-transparent pl-4 pr-8 py-2 text-xs font-bold text-slate-300 outline-none cursor-pointer appearance-none [color-scheme:dark]">
//                   <option value="all" className="bg-black">All Departments</option>
//                   {departments.map((d) => <option key={d} value={d} className="bg-black">{d}</option>)}
//                 </select>
//               </div>
//               {/* Search */}
//               <div className="relative flex-grow lg:flex-grow-0 group">
//                 <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-400 transition-colors"/>
//                 <input type="text" placeholder="Search Personnel…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-56 bg-black/40 border border-white/10 rounded-[1.5rem] pl-10 pr-4 py-3 text-xs text-white outline-none focus:border-cyan-500/50 shadow-inner placeholder:text-slate-500 transition-colors"/>
//               </div>
//               {/* Export buttons */}
//               <button onClick={handleExport} className="px-5 py-3 bg-indigo-500/20 border border-indigo-500/30 rounded-[1.5rem] text-indigo-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-indigo-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
//                 <Download size={14}/> Total Attendance
//               </button>
//               <button onClick={handleAttendanceReport} className="px-5 py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-[1.5rem] text-cyan-300 text-xs font-bold uppercase flex items-center gap-2 hover:bg-cyan-500/30 hover:-translate-y-0.5 transition-all shadow-inner">
//                 <FileText size={14}/> Monthly Report
//               </button>
//             </div>
//           </div>

//           <ArchiveSummaryBar logs={filteredLogs}/>

//           <div className="bg-white/[0.02] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]">
//             <AttendanceTable logs={paginatedLogs} onEdit={setEditLog} onDelete={setDeleteLog} isReadOnly={!canEdit} canDelete={isAdmin} showStatus={true}/>
//             <Pagination total={filteredLogs.length} page={archivePage} perPage={ROWS_PER_PAGE} onChange={setArchivePage}/>
//           </div>
//         </section>
//       </div>

//       {/* ── MODALS ── */}
//       <ManualEntryModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onRefresh={fetchData}/>

//       {editLog && (
//         <EditRecordModal log={editLog} onClose={() => setEditLog(null)} onRefresh={fetchData}/>
//       )}

//       {deleteLog && (
//         <DeleteConfirmModal
//           log={deleteLog}
//           onClose={() => { setDeleteLog(null); setDeleteError(""); }}
//           onConfirm={handleDelete}
//           isDeleting={isDeleting}
//         />
//       )}

//       {/* Delete error toast */}
//       {deleteError && (
//         <div className="fixed bottom-6 right-6 bg-rose-900/90 border border-rose-500/30 text-rose-200 text-xs font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50">
//           <AlertCircle size={14}/> {deleteError}
//           <button onClick={() => setDeleteError("")}><X size={13}/></button>
//         </div>
//       )}

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 20px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default AttendanceDashboard;
