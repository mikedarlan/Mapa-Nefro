
import React, { useMemo } from 'react';
import { ScheduleData, DayGroup, Patient } from '../types';
import { X, Calendar, Clock, Armchair, Activity, CalendarDays, Edit } from 'lucide-react';
import { parseDurationMinutes } from '../constants';

interface PatientScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string | null;
  data: ScheduleData;
  onEditSession: (chair: string, turn: 1 | 2 | 3, dayGroup: DayGroup) => void;
}

export const PatientScheduleModal: React.FC<PatientScheduleModalProps> = ({ 
  isOpen, onClose, patientName, data, onEditSession
}) => {
  if (!isOpen || !patientName) return null;

  const schedule = useMemo(() => {
    const sessions: { 
      dayGroup: DayGroup; 
      chair: string; 
      turn: number; 
      patient: Patient 
    }[] = [];

    const groups: DayGroup[] = ['SEG/QUA/SEX', 'TER/QUI/SÁB'];

    groups.forEach(group => {
      data[group].forEach(chair => {
        [chair.turn1, chair.turn2, chair.turn3].forEach((p, index) => {
          if (p && p.name.trim().toUpperCase() === patientName.trim().toUpperCase()) {
            sessions.push({
              dayGroup: group,
              chair: chair.chairNumber,
              turn: index + 1,
              patient: p
            });
          }
        });
      });
    });

    return sessions;
  }, [data, patientName]);

  // Estatísticas do Paciente
  const totalHours = schedule.reduce((acc, curr) => acc + parseDurationMinutes(curr.patient.duration), 0) / 60;
  const primaryTreatment = schedule[0]?.patient.treatment || 'N/A';
  const sessionCount = schedule.length;
  // Multiplicador aproximado para semanal: Se for Seg/Qua/Sex (3 dias) * horas. 
  // O cálculo abaixo soma as horas cadastradas nos turnos únicos. 
  // Para semanal real, multiplicamos pelo nº de dias da escala.
  const weeklyHoursEstimate = schedule.reduce((acc, curr) => {
      const daysInGroup = curr.dayGroup === 'SEG/QUA/SEX' ? 3 : 3;
      return acc + ((parseDurationMinutes(curr.patient.duration) / 60) * daysInGroup);
  }, 0);


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-appear flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6 shrink-0 flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20"><CalendarDays size={24}/></div>
            <div>
              <h3 className="text-lg font-black tracking-tight uppercase line-clamp-1">{patientName}</h3>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mt-1">Visão Geral da Agenda</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar bg-slate-50 flex-1">
            
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 mb-1">Tratamento</span>
                    <span className="text-sm font-black text-slate-900">{primaryTreatment}</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 mb-1">Carga Semanal</span>
                    <span className="text-sm font-black text-emerald-600">~{weeklyHoursEstimate.toFixed(1)}h</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 mb-1">Dias Ativos</span>
                    <span className="text-sm font-black text-indigo-600">{sessionCount * 3} Dias</span>
                </div>
            </div>

            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <Activity size={14} /> Detalhe das Sessões
            </h4>

            {schedule.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
                    <p className="text-slate-400 font-bold text-xs uppercase">Nenhum agendamento encontrado.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {schedule.map((session, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                            
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-md ${session.dayGroup === 'SEG/QUA/SEX' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                                    {session.dayGroup.substring(0, 1)}
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{session.dayGroup}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-slate-800">Poltrona {session.chair}</span>
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase">{session.turn}º Turno</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right hidden sm:block">
                                    <div className="flex items-center justify-end gap-1.5 text-slate-700 mb-1">
                                        <Clock size={14} strokeWidth={3} />
                                        <span className="text-sm font-black font-mono">{session.patient.startTime}</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded inline-block">
                                        {session.patient.duration.replace(':00', 'h')}
                                    </div>
                                </div>
                                
                                <button 
                                  onClick={() => onEditSession(session.chair, session.turn as 1|2|3, session.dayGroup)}
                                  className="p-3 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm group-hover:shadow-md"
                                  title="Editar esta sessão"
                                >
                                  <Edit size={16} />
                                </button>
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
        
        <div className="p-6 bg-white border-t border-slate-100">
            <button onClick={onClose} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20">
                Fechar Prontuário
            </button>
        </div>
      </div>
    </div>
  );
};
