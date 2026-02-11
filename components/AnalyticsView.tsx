
import React, { useState, useEffect, useRef } from 'react';
import { ScheduleData, DayGroup, OperationalReport, KPI, OptimizationSuggestion, GapOpportunity, Patient, TreatmentType, FrequencyType } from '../types';
import { cleanAIJsonResponse, OPERATING_HOURS_START, OPERATING_HOURS_END, SETUP_DURATION_MINUTES, parseDurationMinutes, timeToMinutes, minutesToTime, allChairs, getStats } from '../constants';
import { 
  Sparkles, Loader2, BrainCircuit, TrendingUp, TrendingDown, 
  Target, Zap, Users, Activity, UserPlus, CheckCircle2, 
  BarChart3, PieChart, ShieldCheck, Clock, PlusCircle, LayoutDashboard, Crosshair, Stethoscope, AlertTriangle, Armchair, ArrowRight, Maximize, Ruler, ArrowLeftRight, MoveRight, Search, ThumbsUp, Calendar, ExternalLink, Scale, Calculator
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface AnalyticsViewProps {
  data: ScheduleData;
  activeTab: DayGroup;
  onPatientClick: (chair: string, turn: 1 | 2 | 3, dayGroup: DayGroup) => void;
}

const STANDARD_SESSION_MINUTES = 240; // 4 Horas
const MIN_CLEANING_TIME = 30; // 30 min intervalo tecnico

// Card Simples para Métricas com Fórmula
const MetricCard: React.FC<{ label: string, value: string | number, subtext: string, formula?: string, color: 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo' | 'cyan' | 'slate' }> = ({ label, value, subtext, formula, color }) => {
    const colors = {
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        rose: 'bg-rose-50 text-rose-700 border-rose-200',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        slate: 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return (
        <div className={`p-6 rounded-3xl border ${colors[color]} flex flex-col justify-between h-40 relative overflow-hidden group transition-all hover:shadow-md`}>
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform`}>
                <Activity size={48} />
            </div>
            
            <div className="relative z-10">
                <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-2">{label}</p>
                <p className="text-4xl font-black tracking-tighter leading-none mb-2">{value}</p>
                <p className="text-[10px] font-bold opacity-80 uppercase">{subtext}</p>
            </div>

            {formula && (
                <div className="relative z-10 mt-3 pt-3 border-t border-black/5 flex items-center gap-2 text-[9px] font-mono opacity-70">
                    <Calculator size={10} />
                    <span>{formula}</span>
                </div>
            )}
        </div>
    );
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ data, onPatientClick }) => {
  const [report, setReport] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Estados do Simulador
  const [simName, setSimName] = useState('');
  const [simGroup, setSimGroup] = useState<DayGroup>('SEG/QUA/SEX');
  const [simDuration, setSimDuration] = useState('04:00');
  const [simSuggestions, setSimSuggestions] = useState<any[]>([]);

  // 1. ENGINE DE CÁLCULO (DETERMINÍSTICO)
  const runAnalysisEngine = () => {
      const groups: DayGroup[] = ['SEG/QUA/SEX', 'TER/QUI/SÁB'];
      const clinicStartMins = OPERATING_HOURS_START * 60; // 05:30 -> 330 min
      const clinicEndMins = OPERATING_HOURS_END * 60;     // 21:00 -> 1260 min
      
      let activeSlotsCount = 0; // Contagem de Slots Ocupados (Não pacientes únicos)
      const gapsFound: GapOpportunity[] = [];
      const optimizationCandidates: any[] = []; 

      // === CÁLCULO DE CAPACIDADE ===
      // Instalada: Total Físico Máximo (Poltronas * Turnos * Escalas)
      // Considerando 20 poltronas, 3 turnos, 2 escalas = 120 vagas.
      const totalChairs = allChairs.length; // 20
      const turnsPerDay = 3;
      const scales = 2;
      const installedCapacity = totalChairs * turnsPerDay * scales; 

      // Efetiva: Capacidade Operacional Meta (85% da Instalada)
      // Representa o ideal operacional considerando margem de segurança/manutenção/absenteísmo
      const effectiveCapacity = Math.round(installedCapacity * 0.85);

      groups.forEach(group => {
          data[group].forEach(chair => {
              const patients = [chair.turn1, chair.turn2, chair.turn3].filter(Boolean) as Patient[];
              
              // Contagem Real (Capacidade Real / Ocupada)
              activeSlotsCount += patients.length;

              // Ordena por horário
              patients.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

              // --- ANÁLISE DE OTIMIZAÇÃO (CANDIDATOS A MOVER) ---
              if (patients.length > 0) {
                  const firstP = patients[0];
                  const firstStart = timeToMinutes(firstP.startTime);
                  
                  // Identificar qual é o turno exato deste paciente para permitir edição
                  let turnNum: 1|2|3 = 1;
                  if (chair.turn1?.id === firstP.id) turnNum = 1;
                  else if (chair.turn2?.id === firstP.id) turnNum = 2;
                  else if (chair.turn3?.id === firstP.id) turnNum = 3;

                  if (firstStart >= 360) { 
                       optimizationCandidates.push({
                           type: 'LATE_START',
                           patient: firstP.name,
                           chair: chair.chairNumber,
                           turn: turnNum, // Adicionado para navegação
                           group: group,
                           currentStart: firstP.startTime,
                           idealStart: "05:30",
                           impact: `Perda de ${firstStart - 330} min no início`
                       });
                  }
              }

              // --- ANÁLISE DE VAGAS (GAPS) ---
              let cursor = clinicStartMins;

              patients.forEach(p => {
                  const pStart = timeToMinutes(p.startTime);
                  const pEnd = pStart + parseDurationMinutes(p.duration);
                  
                  if ((pStart - cursor) >= (STANDARD_SESSION_MINUTES + MIN_CLEANING_TIME)) {
                      gapsFound.push({
                          dayGroup: group,
                          chairNumber: chair.chairNumber,
                          startTime: minutesToTime(cursor),
                          endTime: minutesToTime(pStart),
                          durationMinutes: pStart - cursor,
                          canFitStandardSession: true
                      });
                  }
                  
                  cursor = pEnd + MIN_CLEANING_TIME; 
              });

              if ((clinicEndMins - cursor) >= STANDARD_SESSION_MINUTES) {
                   gapsFound.push({
                      dayGroup: group,
                      chairNumber: chair.chairNumber,
                      startTime: minutesToTime(cursor),
                      endTime: minutesToTime(clinicEndMins),
                      durationMinutes: clinicEndMins - cursor,
                      canFitStandardSession: true
                   });
              }
          });
      });

      // Capacidade Ociosa em relação à Efetiva
      const absorbableCapacity = Math.max(0, effectiveCapacity - activeSlotsCount);
      
      // Taxa de Eficiência (Real vs Efetiva)
      const efficiencyRate = (activeSlotsCount / effectiveCapacity) * 100;
      
      // Taxa de Ocupação Global (Real vs Instalada)
      const globalOccupancyRate = (activeSlotsCount / installedCapacity) * 100;

      // Obtém contagem de pacientes ÚNICOS global
      const stats = getStats(data);

      return {
          installedCapacity,
          effectiveCapacity,
          realCapacity: activeSlotsCount, // Capacidade Real = Ocupação
          uniquePatients: stats.uniquePatients,
          absorbableCapacity,
          efficiencyRate,
          globalOccupancyRate,
          gapsFound,
          optimizationCandidates,
          math: {
              chairs: totalChairs,
              turns: turnsPerDay,
              scales: scales
          }
      };
  };

  useEffect(() => {
      setIsAnalyzing(true);
      setTimeout(() => {
        setReport(runAnalysisEngine());
        setIsAnalyzing(false);
      }, 600);
  }, [data]);

  // --- LÓGICA DO SIMULADOR ---
  const handleSimulate = () => {
      const requiredDuration = parseDurationMinutes(simDuration);
      const suggestions: any[] = [];
      
      const clinicStartMins = OPERATING_HOURS_START * 60;
      const clinicEndMins = OPERATING_HOURS_END * 60;

      data[simGroup].forEach(chair => {
          const patients = [chair.turn1, chair.turn2, chair.turn3].filter(Boolean) as Patient[];
          patients.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

          // Encontrar buracos livres nesta cadeira
          let cursor = clinicStartMins;
          const freeSlots = [];

          // 1. Antes do primeiro paciente
          if (patients.length > 0) {
              const firstStart = timeToMinutes(patients[0].startTime);
              if ((firstStart - cursor) >= requiredDuration) {
                  freeSlots.push({ start: cursor, end: firstStart });
              }
              cursor = firstStart + parseDurationMinutes(patients[0].duration) + MIN_CLEANING_TIME;
          }

          // 2. Entre pacientes
          for (let i = 0; i < patients.length - 1; i++) {
              const currentEnd = timeToMinutes(patients[i].startTime) + parseDurationMinutes(patients[i].duration) + MIN_CLEANING_TIME;
              const nextStart = timeToMinutes(patients[i+1].startTime);
              if ((nextStart - currentEnd) >= requiredDuration) {
                  freeSlots.push({ start: currentEnd, end: nextStart });
              }
          }
          if (patients.length > 0) {
               cursor = timeToMinutes(patients[patients.length - 1].startTime) + parseDurationMinutes(patients[patients.length - 1].duration) + MIN_CLEANING_TIME;
          }

          // 3. Depois do último (ou se vazio)
          if ((clinicEndMins - cursor) >= requiredDuration) {
              freeSlots.push({ start: cursor, end: clinicEndMins });
          }

          // Avaliar Slots Encontrados
          freeSlots.forEach(slot => {
              // Identificar Turno Ideal
              let turnLabel = 1;
              let score = 50;
              let quality = 'Ajustável';
              let badgeColor = 'amber';

              // O horário sugerido é o início do buraco
              const suggestedStart = slot.start;

              // Análise de Qualidade do Horário (Score)
              // Turno 1 Ideal: ~05:30 (330min)
              // Turno 2 Ideal: ~10:30 (630min)
              // Turno 3 Ideal: ~15:30 (930min)

              if (Math.abs(suggestedStart - 330) <= 30) {
                  turnLabel = 1; score = 100; quality = 'Perfeita'; badgeColor = 'emerald';
              } else if (Math.abs(suggestedStart - 630) <= 60) {
                  turnLabel = 2; score = 100; quality = 'Perfeita'; badgeColor = 'emerald';
              } else if (Math.abs(suggestedStart - 930) <= 60) {
                  turnLabel = 3; score = 100; quality = 'Perfeita'; badgeColor = 'emerald';
              } else {
                  // Se não é perfeito, mas cabe
                  if (suggestedStart < 600) turnLabel = 1;
                  else if (suggestedStart < 900) turnLabel = 2;
                  else turnLabel = 3;
                  
                  score = 70;
                  quality = 'Boa - Encaixe';
                  badgeColor = 'blue';
              }

              suggestions.push({
                  chair: chair.chairNumber,
                  turn: turnLabel,
                  startTime: minutesToTime(suggestedStart),
                  endTime: minutesToTime(suggestedStart + requiredDuration),
                  score,
                  quality,
                  badgeColor
              });
          });
      });

      // Ordenar: Melhores Scores primeiro, depois por Poltrona
      suggestions.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return parseInt(a.chair) - parseInt(b.chair);
      });

      setSimSuggestions(suggestions);
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 animate-appear">
      
      {/* Header */}
      <div className="p-8 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 z-10">
        <div className="flex items-center gap-6">
          <div className="bg-slate-900 p-4 rounded-3xl text-emerald-400 shadow-2xl relative overflow-hidden">
             <Target size={32} strokeWidth={2.5} className="relative z-10"/>
             <div className="absolute inset-0 bg-emerald-500/20 blur-xl"></div>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 leading-none uppercase">
              Diagnóstico de Capacidade
            </h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
               Análise Matemática de Vagas e Eficiência
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-8">
        {!report || isAnalyzing ? (
             <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4">
                 <Loader2 size={48} className="animate-spin text-slate-400"/>
                 <p className="text-xs font-black uppercase text-slate-300 tracking-widest">Calculando Métricas...</p>
             </div>
        ) : (
             <div className="max-w-7xl mx-auto space-y-8 animate-appear">
                 
                 {/* 1. KPIs DE CAPACIDADE (TRIADE PRINCIPAL) */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <MetricCard 
                        label="Capacidade Instalada" 
                        value={report.installedCapacity} 
                        subtext="100% - Máximo Teórico Físico" 
                        formula={`${report.math.chairs} Polt. × ${report.math.turns} Turnos × ${report.math.scales} Escalas`}
                        color="slate" 
                     />
                     <MetricCard 
                        label="Capacidade Efetiva" 
                        value={report.effectiveCapacity} 
                        subtext="85% - Meta Operacional Segura" 
                        formula={`${report.installedCapacity} Vagas Totais × 0.85 (Fator Meta)`}
                        color="emerald" 
                     />
                     <MetricCard 
                        label="Capacidade Real" 
                        value={report.realCapacity} 
                        subtext={`${report.globalOccupancyRate.toFixed(1)}% da Instalada (Meta: ${report.effectiveCapacity})`} 
                        formula="Σ Total de Slots Agendados (Turnos Ocupados)"
                        color={report.realCapacity > report.effectiveCapacity ? 'rose' : 'indigo'} 
                     />
                 </div>

                 {/* 1.1 KPIs SECUNDÁRIOS */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                     <MetricCard 
                        label="Taxa de Eficiência" 
                        value={`${report.efficiencyRate.toFixed(1)}%`}
                        subtext="Real vs Efetiva (85%)" 
                        color="blue" 
                     />
                     <MetricCard 
                        label="Pacientes Únicos" 
                        value={report.uniquePatients} 
                        subtext="Total de CPFs (Pessoas)" 
                        color="cyan" 
                     />
                     <MetricCard 
                        label="Capacidade Ociosa" 
                        value={report.absorbableCapacity} 
                        subtext="Vagas até atingir 85%" 
                        color="amber" 
                     />
                      <MetricCard 
                        label="Vagas Imediatas" 
                        value={report.gapsFound.length} 
                        subtext="Prontas para uso (4h)" 
                        color="rose" 
                     />
                 </div>

                 {/* NOVA SEÇÃO: SIMULADOR DE ALOCAÇÃO */}
                 <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                     <div className="bg-slate-900 p-6 flex justify-between items-center">
                         <div className="flex items-center gap-3 text-white">
                             <div className="p-2 bg-indigo-500 rounded-xl"><UserPlus size={20}/></div>
                             <div>
                                 <h3 className="text-lg font-black uppercase tracking-tight">Simulador de Alocação</h3>
                                 <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Encontre o melhor lugar para um novo paciente</p>
                             </div>
                         </div>
                     </div>
                     
                     <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                         {/* FORMULÁRIO */}
                         <div className="space-y-4 lg:col-span-1 border-r border-slate-100 pr-8">
                             <div>
                                 <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Nome do Paciente (Opcional)</label>
                                 <input 
                                    type="text" 
                                    value={simName} 
                                    onChange={e => setSimName(e.target.value)} 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-indigo-500"
                                    placeholder="EX: NOVO PACIENTE"
                                 />
                             </div>
                             <div>
                                 <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Escala Desejada</label>
                                 <select 
                                    value={simGroup} 
                                    onChange={e => setSimGroup(e.target.value as DayGroup)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-indigo-500"
                                 >
                                     <option value="SEG/QUA/SEX">SEG / QUA / SEX</option>
                                     <option value="TER/QUI/SÁB">TER / QUI / SÁB</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Duração da Sessão</label>
                                 <select 
                                    value={simDuration} 
                                    onChange={e => setSimDuration(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-indigo-500"
                                 >
                                     <option value="03:00">03:00 Horas</option>
                                     <option value="03:30">03:30 Horas</option>
                                     <option value="04:00">04:00 Horas (Padrão)</option>
                                     <option value="04:30">04:30 Horas</option>
                                 </select>
                             </div>
                             <button 
                                onClick={handleSimulate}
                                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 mt-4"
                             >
                                 <Search size={16} /> Buscar Vagas
                             </button>
                         </div>

                         {/* RESULTADOS */}
                         <div className="lg:col-span-2">
                             <div className="flex items-center justify-between mb-4">
                                 <h4 className="text-xs font-black uppercase text-slate-500 flex items-center gap-2">
                                     <ThumbsUp size={14} className="text-indigo-500"/> Sugestões do Sistema
                                 </h4>
                                 {simSuggestions.length > 0 && <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[10px] font-black uppercase">{simSuggestions.length} Opções Encontradas</span>}
                             </div>

                             <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                 {simSuggestions.length === 0 ? (
                                     <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                                         <p className="text-slate-400 font-bold text-xs uppercase">Preencha os dados e clique em buscar</p>
                                     </div>
                                 ) : (
                                     simSuggestions.map((sug, idx) => (
                                         <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-300 transition-all shadow-sm">
                                             <div className="flex items-center gap-4">
                                                 <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-black text-lg border border-slate-200">
                                                     {sug.chair.replace(/[^0-9]/g, '')}
                                                 </div>
                                                 <div>
                                                     <div className="flex items-center gap-2 mb-1">
                                                         <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded text-white ${sug.badgeColor === 'emerald' ? 'bg-emerald-500' : sug.badgeColor === 'blue' ? 'bg-blue-500' : 'bg-amber-500'}`}>
                                                             {sug.quality}
                                                         </span>
                                                         <span className="text-[10px] font-bold text-slate-400 uppercase">{sug.turn}º Turno</span>
                                                     </div>
                                                     <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                                                         {sug.startTime} <ArrowRight size={12} className="text-slate-300"/> {sug.endTime}
                                                     </p>
                                                 </div>
                                             </div>
                                             <div className="text-right">
                                                 <p className="text-[10px] font-bold text-slate-400 uppercase">Escala</p>
                                                 <p className="text-xs font-black text-indigo-600 uppercase">{simGroup}</p>
                                             </div>
                                         </div>
                                     ))
                                 )}
                             </div>
                         </div>
                     </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     
                     {/* 2. OPORTUNIDADES DE MELHORIA (OPTIMIZATIONS) */}
                     <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 h-full flex flex-col">
                         <div className="flex justify-between items-center mb-6">
                             <div className="flex items-center gap-3">
                                 <div className="p-2 bg-rose-100 text-rose-600 rounded-lg"><AlertTriangle size={20}/></div>
                                 <h3 className="text-lg font-black uppercase text-slate-800">Gargalos de Horário</h3>
                             </div>
                             <span className="bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase">Ação Necessária</span>
                         </div>
                         
                         <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[400px]">
                             {report.optimizationCandidates.length === 0 ? (
                                 <div className="text-center py-10 text-slate-300 text-xs font-bold uppercase">Nenhum gargalo crítico identificado.</div>
                             ) : (
                                 report.optimizationCandidates.map((opt: any, idx: number) => (
                                     <div 
                                        key={idx} 
                                        onClick={() => onPatientClick(opt.chair, opt.turn, opt.group)}
                                        className="flex flex-col gap-2 p-4 rounded-2xl bg-rose-50/50 border border-rose-100 hover:border-rose-300 hover:bg-rose-100 transition-all cursor-pointer group"
                                        title="Clique para editar este paciente no mapa"
                                     >
                                         <div className="flex justify-between items-start">
                                             <div>
                                                 <p className="text-[10px] font-black uppercase text-slate-500 group-hover:text-rose-600 transition-colors flex items-center gap-2">
                                                    {opt.group} • Poltrona {opt.chair} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                                                 </p>
                                                 <p className="text-sm font-black text-slate-800">{opt.patient}</p>
                                             </div>
                                             <div className="text-right">
                                                 <span className="text-[10px] font-bold text-rose-500 bg-white px-2 py-1 rounded border border-rose-100">{opt.impact}</span>
                                             </div>
                                         </div>
                                         
                                         <div className="flex items-center gap-3 mt-2 pt-2 border-t border-rose-100/50">
                                             <div className="flex items-center gap-1.5 text-slate-400">
                                                 <Clock size={12}/> <span className="text-xs font-mono line-through">{opt.currentStart}</span>
                                             </div>
                                             <ArrowRight size={12} className="text-emerald-500"/>
                                             <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                                 <Clock size={12}/> <span className="text-xs font-black font-mono">{opt.idealStart}</span>
                                             </div>
                                             <p className="text-[9px] text-slate-400 ml-auto">Sugestão: Antecipar</p>
                                         </div>
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>

                     {/* 3. MAPA DE VAGAS (GAPS) */}
                     <div className="bg-emerald-50/50 rounded-[2.5rem] border border-emerald-100 p-8 h-full flex flex-col relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100 rounded-bl-full opacity-30 z-0"></div>
                         <div className="relative z-10 flex justify-between items-center mb-6">
                             <div className="flex items-center gap-3">
                                 <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><CheckCircle2 size={20}/></div>
                                 <h3 className="text-lg font-black uppercase text-emerald-900">Mapa de Vagas Livres</h3>
                             </div>
                             <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Onde encaixar pacientes</span>
                         </div>

                         <div className="flex-1 space-y-3 relative z-10 overflow-y-auto custom-scrollbar max-h-[400px] pr-2">
                             {report.gapsFound.length === 0 ? (
                                 <div className="text-center py-10 text-emerald-300 text-xs font-bold uppercase">Sem vagas de 4h disponíveis.</div>
                             ) : (
                                 report.gapsFound.map((gap: GapOpportunity, idx: number) => (
                                     <div key={idx} className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex justify-between items-center">
                                         <div className="flex items-center gap-4">
                                             <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-sm border border-emerald-100">
                                                 {gap.chairNumber.replace(/[^0-9]/g, '')}
                                             </div>
                                             <div>
                                                 <p className="text-[10px] font-black uppercase text-slate-400">{gap.dayGroup}</p>
                                                 <p className="text-sm font-black text-slate-800 tracking-tight">
                                                     {gap.startTime} <span className="text-slate-300 mx-1">➜</span> {gap.endTime}
                                                 </p>
                                             </div>
                                         </div>
                                         <div className="text-right">
                                             <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                                 {Math.floor(gap.durationMinutes / 60)}h livres
                                             </span>
                                         </div>
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>
                 </div>

             </div>
        )}
      </div>
    </div>
  );
};
