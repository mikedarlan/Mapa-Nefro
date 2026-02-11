
import React, { useState, useEffect, useMemo } from 'react';
import { Patient, DayGroup, TreatmentType, FrequencyType } from '../types';
import { X, Clock, AlertCircle, User, Save, Trash2, AlertOctagon, Calendar, Armchair, CheckCircle2, BedDouble, CalendarDays, Grip } from 'lucide-react';
import { OPERATING_HOURS_START, OPERATING_HOURS_END, allChairs, minutesToTime, SLOT_INTERVAL } from '../constants';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patient: Patient | null, chairNum: string | string[], turnNum: 1 | 2 | 3, dayGroup: DayGroup) => void;
  initialData?: Patient | null;
  shiftLabel: DayGroup;
  currentChair?: string | null;
  currentTurn?: 1 | 2 | 3 | null;
  initialDayGroup: DayGroup;
}

export const PatientModal: React.FC<PatientModalProps> = ({ 
  isOpen, onClose, onSave, initialData, currentChair, currentTurn, initialDayGroup
}) => {
  const [name, setName] = useState('');
  const [treatment, setTreatment] = useState<TreatmentType>('HD');
  const [startTime, setStartTime] = useState('05:30');
  const [duration, setDuration] = useState('04:00');
  const [frequency, setFrequency] = useState<FrequencyType>('3x');
  
  const [selectedChairs, setSelectedChairs] = useState<string[]>([]);
  
  const [selectedTurn, setSelectedTurn] = useState<1 | 2 | 3>(1);
  const [selectedDayGroup, setSelectedDayGroup] = useState<DayGroup>(initialDayGroup);
  
  const [specificDays, setSpecificDays] = useState<string[]>([]);
  
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const timeOptions = useMemo(() => {
    const options = [];
    for (let t = OPERATING_HOURS_START * 60; t < OPERATING_HOURS_END * 60; t += SLOT_INTERVAL) {
      options.push(minutesToTime(t));
    }
    return options;
  }, []);

  const ALL_DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsConfirmingDelete(false);
      
      const effectiveGroup = initialData ? initialDayGroup : initialDayGroup; 
      setSelectedDayGroup(effectiveGroup);

      if (initialData) {
        setName(initialData.name);
        setTreatment(initialData.treatment || 'HD');
        setStartTime(initialData.startTime);
        setDuration(initialData.duration);
        setFrequency(initialData.frequency || '3x');
        setSelectedChairs(currentChair ? [currentChair] : []);
        setSelectedTurn(currentTurn || 1);
        
        if (initialData.specificDays && initialData.specificDays.length > 0) {
            setSpecificDays(initialData.specificDays);
        } else {
             if (initialData.frequency === 'Diário') {
                 setSpecificDays(ALL_DAYS);
             } else {
                 if (effectiveGroup === 'SEG/QUA/SEX') setSpecificDays(['SEG', 'QUA', 'SEX']);
                 else setSpecificDays(['TER', 'QUI', 'SÁB']);
             }
        }

      } else {
        setName('');
        setTreatment('HD');
        setStartTime(currentTurn === 1 ? '05:30' : currentTurn === 2 ? '10:30' : currentTurn === 3 ? '15:30' : '05:30');
        setDuration('04:00');
        setFrequency('3x');
        setSelectedChairs(currentChair ? [currentChair] : ['01']);
        setSelectedTurn(currentTurn || 1);
        
        // Default days based on where the user clicked
        if (effectiveGroup === 'SEG/QUA/SEX') setSpecificDays(['SEG', 'QUA', 'SEX']);
        else setSpecificDays(['TER', 'QUI', 'SÁB']);
      }
    }
  }, [isOpen, initialData, currentChair, currentTurn, initialDayGroup]);

  // Atualização inteligente dos dias quando muda a frequência
  useEffect(() => {
      if (!isOpen) return;
      if (initialData) return; 

      if (frequency === 'Diário') {
          setSpecificDays(ALL_DAYS);
      }
  }, [frequency, isOpen]);

  if (!isOpen) return null;

  const toggleChair = (chair: string) => {
    setSelectedChairs(prev => {
      if (prev.includes(chair)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== chair);
      } else {
        return [...prev, chair];
      }
    });
  };

  const toggleDay = (day: string) => {
      setSpecificDays(prev => {
          if (prev.includes(day)) {
              if (prev.length === 1 && frequency !== 'Extra') return prev; 
              return prev.filter(d => d !== day);
          } else {
              return [...prev, day];
          }
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("O nome do paciente é obrigatório."); return; }
    if (selectedChairs.length === 0) { setError("Selecione pelo menos uma poltrona."); return; }
    if (specificDays.length === 0) { setError("Selecione ao menos um dia da semana."); return; }

    onSave({
      id: initialData?.id || crypto.randomUUID(),
      name: name.toUpperCase(),
      treatment,
      startTime,
      duration,
      frequency,
      specificDays,
      checked: initialData?.checked || false
    }, selectedChairs, selectedTurn, selectedDayGroup);
    onClose();
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block ml-1";
  const inputClass = "w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[1.2rem] font-bold text-slate-900 focus:ring-4 focus:ring-cyan-600/10 focus:border-cyan-600 transition-all outline-none";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-appear flex flex-col max-h-[95vh]">
        <div className="bg-slate-900 px-10 py-6 shrink-0 flex justify-between items-center text-white">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-cyan-600 rounded-2xl shadow-lg shadow-cyan-600/20"><User size={24}/></div>
            <div>
              <h3 className="text-lg font-black tracking-tight uppercase">{initialData ? 'Editar Prontuário' : 'Novo Cadastro'}</h3>
              <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em] mt-1">Nefrologia Hospitalar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {error && <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[11px] font-bold uppercase flex items-center gap-3 border border-rose-100"><AlertCircle size={18}/> {error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Nome Completo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="EX: JOÃO DA SILVA" className={`${inputClass} uppercase`} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tipo de Tratamento</label>
              <select value={treatment} onChange={e => setTreatment(e.target.value as TreatmentType)} className={inputClass}>
                <option value="HD">Hemodiálise (HD)</option>
                <option value="HDF">Hemodiafiltração (HDF)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-100">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                    <label className={labelClass}>Frequência de Atendimento</label>
                    <select value={frequency} onChange={e => setFrequency(e.target.value as FrequencyType)} className={inputClass}>
                        <option value="3x">3x na semana (Padrão)</option>
                        <option value="2x">2x na semana</option>
                        <option value="Diário">Diário (6x)</option>
                        <option value="Extra">Atendimento Extra</option>
                    </select>
                </div>
             </div>
             
             <div className="bg-cyan-50/50 p-4 rounded-2xl border border-cyan-100/50">
                <label className="text-[10px] font-black text-cyan-600 uppercase tracking-[0.15em] mb-2 flex items-center gap-2">
                    <CalendarDays size={12} /> Dias Específicos (Obrigatório)
                </label>
                <div className="flex gap-2">
                    {ALL_DAYS.map(day => {
                        const isSelected = specificDays.includes(day);
                        return (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(day)}
                                className={`
                                    flex-1 py-3 px-2 rounded-xl text-xs font-black uppercase transition-all border-2
                                    ${isSelected 
                                        ? 'bg-cyan-600 text-white border-cyan-600 shadow-lg shadow-cyan-600/20' 
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-cyan-300 hover:text-cyan-500'}
                                `}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[9px] font-bold text-cyan-700/60 mt-2 text-center">
                    Selecione os dias que o paciente virá. O sistema agendará automaticamente nas respectivas escalas.
                </p>
             </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-1">
              <label className={labelClass}>Horário Início</label>
              <select value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass}>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Duração</label>
              <select value={duration} onChange={e => setDuration(e.target.value)} className={inputClass}>
                <option value="02:00">02:00h</option>
                <option value="02:30">02:30h</option>
                <option value="03:00">03:00h</option>
                <option value="03:30">03:30h</option>
                <option value="04:00">04:00h</option>
                <option value="04:30">04:30h</option>
              </select>
            </div>
            <div className="space-y-1 col-span-2 md:col-span-1">
              <label className={labelClass}>Turno</label>
              <select value={selectedTurn} onChange={e => setSelectedTurn(parseInt(e.target.value) as 1|2|3)} className={inputClass}>
                <option value={1}>1º Turno</option>
                <option value={2}>2º Turno</option>
                <option value={3}>3º Turno</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-100">
            <div className="flex justify-between items-end mb-2">
                <label className={labelClass}>
                    <Grip size={12} className="inline mr-1 mb-0.5" /> 
                    Seleção de Assento
                </label>
                <span className="text-[10px] font-black text-cyan-600 uppercase bg-cyan-50 px-3 py-1.5 rounded-lg border border-cyan-100">
                    {selectedChairs.length} Selecionados
                </span>
            </div>
            
            <div className="bg-slate-50/50 p-5 rounded-[2rem] border border-slate-200">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {allChairs.map(c => {
                        const isSelected = selectedChairs.includes(c);
                        const isBed = c.toLowerCase().includes('leito');
                        const label = isBed ? 'Leito' : 'Poltrona';
                        const number = c.replace(/[^0-9]/g, '');

                        return (
                            <button
                                key={c}
                                type="button"
                                onClick={() => toggleChair(c)}
                                className={`
                                    relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 group h-24
                                    active:scale-95 outline-none overflow-hidden border-[3px]
                                    ${isSelected 
                                        ? isBed
                                            ? 'bg-teal-500 border-teal-600 text-white shadow-xl shadow-teal-500/30 z-10 scale-105' // Bed Selected
                                            : 'bg-cyan-500 border-cyan-600 text-white shadow-xl shadow-cyan-500/30 z-10 scale-105' // Chair Selected
                                        : isBed
                                            ? 'bg-slate-100 border-slate-200 text-slate-400 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-600' // Bed Unselected
                                            : 'bg-white border-slate-100 text-slate-400 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-600 hover:shadow-lg' // Chair Unselected
                                    }
                                `}
                            >
                                {isSelected && (
                                    <div className="absolute top-1.5 right-1.5 text-white/90 animate-appear">
                                        <CheckCircle2 size={16} strokeWidth={4} />
                                    </div>
                                )}

                                <div className="flex flex-col items-center justify-center h-full w-full gap-1 mt-1">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className={`transition-colors duration-300 ${
                                            isSelected 
                                                ? 'text-white/80' 
                                                : isBed ? 'text-slate-300 group-hover:text-teal-500' : 'text-slate-300 group-hover:text-cyan-500'
                                        }`}>
                                            {isBed ? <BedDouble size={24} strokeWidth={2} /> : <Armchair size={24} strokeWidth={2} />}
                                        </div>
                                        
                                        <span className={`text-2xl font-black leading-none tracking-tight ${
                                            isSelected ? 'text-white' : 'text-slate-700 group-hover:text-slate-900'
                                        }`}>
                                            {number}
                                        </span>
                                    </div>
                                    
                                    <span className={`text-[9px] font-black uppercase tracking-wider ${
                                        isSelected ? 'text-white/90' : 'text-slate-300 group-hover:text-slate-500'
                                    }`}>
                                        {label}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4 shrink-0">
            {initialData && (
              <div className="flex-1 flex gap-2">
                {!isConfirmingDelete ? (
                  <button type="button" onClick={() => setIsConfirmingDelete(true)} className="w-full py-4 bg-white text-rose-500 rounded-2xl font-black text-[11px] uppercase border border-rose-200 hover:bg-rose-50 flex items-center justify-center gap-2 transition-all">
                    <Trash2 size={16}/> Remover
                  </button>
                ) : (
                  <div className="w-full flex gap-2 animate-appear">
                    <button type="button" onClick={() => setIsConfirmingDelete(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[11px] uppercase transition-all">Voltar</button>
                    <button type="button" onClick={() => {onSave(null, selectedChairs, selectedTurn, selectedDayGroup); onClose();}} className="flex-[1.5] py-4 bg-rose-600 text-white rounded-2xl font-black text-[11px] uppercase shadow-lg shadow-rose-500/20 hover:bg-rose-700 flex items-center justify-center gap-2 transition-all">
                      <AlertOctagon size={16}/> Confirmar
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isConfirmingDelete && (
              <button type="submit" className="flex-[2] py-4 bg-cyan-600 text-white rounded-2xl font-black text-[11px] uppercase shadow-lg hover:bg-cyan-700 flex items-center justify-center gap-3 transition-all hover:scale-[1.02]">
                <Save size={18} /> Salvar {selectedChairs.length > 1 ? `(${selectedChairs.length})` : ''}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
