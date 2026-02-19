
import React, { useState, useEffect, useMemo } from 'react';
import { ScheduleData, FlatPatientRecord, DayGroup, TreatmentType, FrequencyType } from '../types';
import { flattenSchedule, rebuildSchedule, getChairNumber, timeToMinutes, minutesToTime, parseDurationMinutes, SETUP_DURATION_MINUTES, OPERATING_HOURS_START, OPERATING_HOURS_END, SLOT_INTERVAL, allChairs, normalizeString } from '../constants';
import { Save, Trash2, Search, Edit, Filter, Armchair, UserSquare, Users, CalendarSearch, RefreshCw, Clock, ArrowRight, ArrowUpDown, Check, X, AlertTriangle, Zap, SprayCan, Eraser, CalendarDays, Move } from 'lucide-react';

interface SpreadsheetViewProps {
  data: ScheduleData;
  activeTab: DayGroup; 
  onUpdate: (newData: ScheduleData) => void;
  onEdit: (chair: string, turn: 1|2|3, group: DayGroup) => void;
  onViewSchedule: (patientName: string) => void; 
  onReset: () => void;
}

type SortKey = 'name' | 'chair' | 'time' | 'treatment';

// Interface estendida para suportar edição completa
interface EditState {
    name: string;
    startTime: string;
    duration: string;
    chairNumber: string;
    dayGroup: DayGroup;
    turn: 1 | 2 | 3;
    treatment: TreatmentType;
    frequency: FrequencyType;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ data, onUpdate, onEdit, onViewSchedule, onReset }) => {
  const [records, setRecords] = useState<FlatPatientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtros
  const [filterDay, setFilterDay] = useState<'ALL' | DayGroup>('ALL');
  const [filterTreatment, setFilterTreatment] = useState<'ALL' | TreatmentType>('ALL');
  
  // Estado de Edição Inline Completa
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditState | null>(null);
  
  // Estado de Ordenação
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // Estado de Exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(flattenSchedule(data));
  }, [data]);

  // CÁLCULO DE ÚNICOS
  const uniquePatientsCount = useMemo(() => {
      const uniqueNames = new Set(records.map(r => normalizeString(r.name)));
      return uniqueNames.size;
  }, [records]);

  // --- OPÇÕES DE SELECT PARA EDIÇÃO ---
  const timeOptions = useMemo(() => {
      const options = [];
      for (let t = OPERATING_HOURS_START * 60; t < OPERATING_HOURS_END * 60; t += SLOT_INTERVAL) {
        options.push(minutesToTime(t));
      }
      return options;
  }, []);

  const durationOptions = ["02:00", "02:30", "03:00", "03:30", "04:00", "04:30"];

  // --- LÓGICA DE ORDENAÇÃO E FILTRO ---
  const filteredAndSorted = useMemo(() => {
    let result = records.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterDay === 'ALL' || r.dayGroup === filterDay) &&
      (filterTreatment === 'ALL' || r.treatment === filterTreatment)
    );

    result.sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.key) {
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'chair':
                if (a.dayGroup !== b.dayGroup) return a.dayGroup.localeCompare(b.dayGroup);
                comparison = getChairNumber(a.chairNumber) - getChairNumber(b.chairNumber);
                break;
            case 'time':
                comparison = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
                break;
            case 'treatment':
                comparison = a.treatment.localeCompare(b.treatment);
                break;
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, searchTerm, filterDay, filterTreatment, sortConfig]);

  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  // --- AÇÕES DE EDIÇÃO INLINE ---
  const startEditing = (rec: FlatPatientRecord) => {
      setEditingId(rec.id);
      setEditValues({
          name: rec.name,
          startTime: rec.startTime,
          duration: rec.duration,
          chairNumber: rec.chairNumber,
          dayGroup: rec.dayGroup,
          turn: rec.turn,
          treatment: rec.treatment,
          frequency: rec.frequency
      });
      setConfirmDeleteId(null);
  };

  const cancelEditing = () => {
      setEditingId(null);
      setEditValues(null);
  };

  const saveEditing = (originalRec: FlatPatientRecord) => {
      if (!editValues) return;
      
      const hasMoved = 
        editValues.dayGroup !== originalRec.dayGroup || 
        editValues.chairNumber !== originalRec.chairNumber ||
        editValues.turn !== originalRec.turn;

      const newData = JSON.parse(JSON.stringify(data)); // Deep clone

      if (hasMoved) {
          // 1. Verificar se o destino está livre
          const targetChair = newData[editValues.dayGroup].find((c: any) => c.chairNumber === editValues.chairNumber);
          if (!targetChair) return; // Erro de integridade

          const targetSlot = targetChair[`turn${editValues.turn}`];
          if (targetSlot && targetSlot.id !== originalRec.id) {
              alert(`A Poltrona ${editValues.chairNumber} no Turno ${editValues.turn} (${editValues.dayGroup}) já está ocupada por ${targetSlot.name}.`);
              return;
          }

          // 2. Remover da origem
          const oldChair = newData[originalRec.dayGroup].find((c: any) => c.chairNumber === originalRec.chairNumber);
          if (oldChair) {
              oldChair[`turn${originalRec.turn}`] = null;
          }

          // 3. Inserir no destino
          targetChair[`turn${editValues.turn}`] = {
              ...originalRec,
              name: editValues.name.toUpperCase(),
              startTime: editValues.startTime,
              duration: editValues.duration,
              treatment: editValues.treatment,
              frequency: editValues.frequency,
              // Ajusta dias específicos se mudou o grupo
              specificDays: editValues.dayGroup === 'SEG/QUA/SEX' ? ['SEG', 'QUA', 'SEX'] : ['TER', 'QUI', 'SÁB']
          };

      } else {
          // Edição simples in-place
          const chair = newData[originalRec.dayGroup].find((c: any) => c.chairNumber === originalRec.chairNumber);
          if (chair) {
               chair[`turn${originalRec.turn}`] = {
                   ...chair[`turn${originalRec.turn}`],
                   name: editValues.name.toUpperCase(),
                   startTime: editValues.startTime,
                   duration: editValues.duration,
                   treatment: editValues.treatment,
                   frequency: editValues.frequency
               };
          }
      }
      
      onUpdate(newData);
      setEditingId(null);
      setEditValues(null);
  };

  const initiateDelete = (id: string) => {
    if (editingId) cancelEditing(); 
    setConfirmDeleteId(id);
    setTimeout(() => {
      setConfirmDeleteId(prev => prev === id ? null : prev);
    }, 4000);
  };

  const executeDelete = (id: string) => {
    const newData = JSON.parse(JSON.stringify(data));
    ['SEG/QUA/SEX', 'TER/QUI/SÁB'].forEach(group => {
        newData[group as DayGroup].forEach((chair: any) => {
            [1, 2, 3].forEach(t => {
                if (chair[`turn${t}`]?.id === id) {
                    chair[`turn${t}`] = null;
                }
            });
        });
    });
    
    onUpdate(newData);
    setConfirmDeleteId(null);
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 h-full flex flex-col overflow-hidden animate-appear shadow-sm">
      {/* Header da Lista */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg"><Users size={20} /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Lista Geral Interativa</h2>
            {/* ATUALIZADO: Mostra contagem única */}
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{uniquePatientsCount} Pacientes Únicos ({records.length} Agendamentos)</p>
          </div>
        </div>
        
        {/* Ações e Filtros */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <button 
                onClick={onReset} 
                className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-all shadow-sm active:scale-95 group"
           >
                <Eraser size={14} className="group-hover:animate-pulse" /> 
                <span className="hidden sm:inline">Limpar Lista</span>
           </button>

           <div className="h-6 w-px bg-slate-200 mx-1"></div>

           <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
               <button onClick={() => setFilterDay('ALL')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterDay === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Todos</button>
               <button onClick={() => setFilterDay('SEG/QUA/SEX')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterDay === 'SEG/QUA/SEX' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>Seg/Qua</button>
               <button onClick={() => setFilterDay('TER/QUI/SÁB')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filterDay === 'TER/QUI/SÁB' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:text-slate-600'}`}>Ter/Qui</button>
           </div>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="px-6 py-4 border-b border-slate-50 bg-white grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={16} />
          <input type="text" placeholder="Buscar paciente por nome..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300" />
        </div>
        <div className="relative group">
           <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
           <select value={filterTreatment} onChange={e => setFilterTreatment(e.target.value as any)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase appearance-none outline-none cursor-pointer hover:bg-slate-100 transition-all">
            <option value="ALL">Filtrar por Tratamento (Todos)</option>
            <option value="HD">Hemodiálise (HD)</option>
            <option value="HDF">Hemodiafiltração (HDF)</option>
          </select>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="flex-1 overflow-auto p-0 bg-white custom-scrollbar">
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
              <tr className="text-slate-500 text-[9px] font-black uppercase tracking-[0.15em]">
                <th className="px-6 py-4 border-b border-slate-200 w-24">Tipo</th>
                <th className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-2">Paciente <ArrowUpDown size={10} className="opacity-50"/></div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">Escala (Editável)</div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('chair')}>
                    <div className="flex items-center gap-2">Local <ArrowUpDown size={10} className="opacity-50"/></div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('time')}>
                    <div className="flex items-center gap-2">Horário <ArrowUpDown size={10} className="opacity-50"/></div>
                </th>
                <th className="px-6 py-4 border-b border-slate-200 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAndSorted.map((rec) => {
                const isEditing = editingId === rec.id;
                const isConfirming = confirmDeleteId === rec.id;
                const isHDF = (isEditing && editValues ? editValues.treatment : rec.treatment) === 'HDF';
                
                // Valores para exibição
                const displayStart = isEditing && editValues ? editValues.startTime : rec.startTime;
                const displayDuration = isEditing && editValues ? editValues.duration : rec.duration;
                const displayChair = isEditing && editValues ? editValues.chairNumber : rec.chairNumber;
                const displayGroup = isEditing && editValues ? editValues.dayGroup : rec.dayGroup;
                const displayTurn = isEditing && editValues ? editValues.turn : rec.turn;

                const startMins = timeToMinutes(displayStart);
                const durationMins = parseDurationMinutes(displayDuration);
                const endTimeStr = minutesToTime(startMins + durationMins);

                return (
                  <tr key={rec.uniqueId} className={`group hover:bg-slate-50 transition-colors ${isConfirming ? 'bg-rose-50' : ''}`}>
                    
                    {/* TIPO */}
                    <td className="px-6 py-3 relative">
                       {isEditing && editValues ? (
                           <select 
                               value={editValues.treatment}
                               onChange={(e) => setEditValues({...editValues, treatment: e.target.value as TreatmentType})}
                               className="bg-white border border-indigo-200 rounded px-2 py-1 text-[10px] font-bold outline-none"
                           >
                               <option value="HD">HD</option>
                               <option value="HDF">HDF</option>
                           </select>
                       ) : (
                           <div className={`
                             inline-flex items-center gap-1.5 text-[9px] font-black px-2 py-1 rounded-lg uppercase border
                             ${isHDF ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}
                           `}>
                             {isHDF ? 'HDF' : 'HD'}
                           </div>
                       )}
                    </td>
                    
                    {/* NOME */}
                    <td className="px-6 py-3" onClick={() => !isEditing && startEditing(rec)}>
                       {isEditing && editValues ? (
                           <input 
                              autoFocus
                              type="text" 
                              value={editValues.name}
                              onChange={(e) => setEditValues({...editValues, name: e.target.value})}
                              className="w-full bg-white border-2 border-indigo-200 rounded-lg px-3 py-2 text-xs font-black uppercase text-indigo-900 outline-none focus:border-indigo-500 shadow-sm"
                           />
                       ) : (
                           <p className="text-xs font-black uppercase text-slate-800 cursor-pointer hover:text-indigo-600 transition-colors">{rec.name}</p>
                       )}
                    </td>

                    {/* ESCALA (EDITÁVEL) */}
                    <td className="px-6 py-3">
                         {isEditing && editValues ? (
                             <select 
                                value={editValues.dayGroup} 
                                onChange={(e) => setEditValues({...editValues, dayGroup: e.target.value as DayGroup})}
                                className="bg-white border-2 border-indigo-200 rounded px-2 py-1.5 text-[10px] font-black uppercase outline-none text-indigo-700 w-full"
                             >
                                 <option value="SEG/QUA/SEX">SEG/QUA/SEX</option>
                                 <option value="TER/QUI/SÁB">TER/QUI/SÁB</option>
                             </select>
                         ) : (
                             <div className="flex items-center gap-1.5 text-slate-500">
                                 <CalendarDays size={12} />
                                 <span className="text-[10px] font-black uppercase">{displayGroup}</span>
                             </div>
                         )}
                    </td>

                    {/* LOCAL (POLTRONA + TURNO EDITÁVEIS) */}
                    <td className="px-6 py-3">
                       {isEditing && editValues ? (
                           <div className="flex flex-col gap-2">
                               <select 
                                   value={editValues.chairNumber} 
                                   onChange={(e) => setEditValues({...editValues, chairNumber: e.target.value})}
                                   className="bg-white border border-indigo-200 rounded px-2 py-1 text-[10px] font-bold outline-none uppercase"
                               >
                                   {allChairs.map(c => <option key={c} value={c}>{c}</option>)}
                               </select>
                               <select 
                                   value={editValues.turn} 
                                   onChange={(e) => setEditValues({...editValues, turn: parseInt(e.target.value) as 1|2|3})}
                                   className="bg-white border border-indigo-200 rounded px-2 py-1 text-[10px] font-bold outline-none"
                               >
                                   <option value={1}>1º Turno</option>
                                   <option value={2}>2º Turno</option>
                                   <option value={3}>3º Turno</option>
                               </select>
                           </div>
                       ) : (
                           <div className="flex flex-col">
                               <span className="text-[10px] font-black text-indigo-600 uppercase">Poltrona {displayChair}</span>
                               <span className="text-[9px] font-bold text-slate-400 uppercase">{displayTurn}º Turno</span>
                           </div>
                       )}
                    </td>

                    {/* HORÁRIO */}
                    <td className="px-6 py-3 text-[11px] font-bold font-mono text-slate-600">
                        {isEditing && editValues ? (
                             <div className="flex flex-col gap-2">
                                 <select 
                                    value={editValues.startTime} 
                                    onChange={(e) => setEditValues({...editValues, startTime: e.target.value})}
                                    className="bg-white border border-indigo-200 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                 >
                                     {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                 </select>
                                 <select 
                                    value={editValues.duration} 
                                    onChange={(e) => setEditValues({...editValues, duration: e.target.value})}
                                    className="bg-white border border-indigo-200 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                 >
                                     {durationOptions.map(d => <option key={d} value={d}>{d.replace(':', 'h')}</option>)}
                                 </select>
                             </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-1">
                                    {displayStart} 
                                    <ArrowRight size={10} className="text-slate-300"/> 
                                    {endTimeStr}
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{displayDuration.replace(':00', 'h')} Duração</div>
                            </>
                        )}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        {isEditing ? (
                            <div className="flex items-center gap-2 animate-appear">
                                <button onClick={() => saveEditing(rec)} className="p-2 bg-emerald-500 text-white rounded-lg shadow-lg hover:bg-emerald-600 transition-all" title="Salvar">
                                    <Check size={16} strokeWidth={3} />
                                </button>
                                <button onClick={cancelEditing} className="p-2 bg-slate-200 text-slate-500 rounded-lg hover:bg-slate-300 transition-all" title="Cancelar">
                                    <X size={16} strokeWidth={3} />
                                </button>
                            </div>
                        ) : isConfirming ? (
                            <div className="flex items-center gap-2 animate-appear">
                                <span className="text-[9px] font-bold text-rose-400 uppercase mr-1">Excluir?</span>
                                <button onClick={() => setConfirmDeleteId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all"><X size={14}/></button>
                                <button onClick={() => executeDelete(rec.id)} className="p-2 bg-rose-600 text-white rounded-lg shadow-lg hover:bg-rose-700 transition-all"><Trash2 size={14}/></button>
                            </div>
                        ) : (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEditing(rec)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Editar Linha">
                                    <Edit size={14}/>
                                </button>
                                <button onClick={() => initiateDelete(rec.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Excluir">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAndSorted.length === 0 && (
                  <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">
                          Nenhum paciente encontrado com estes filtros
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
      </div>
      
      {/* Footer Fixo */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center px-6">
         <span>Total de Registros: {records.length}</span>
         <span>Edição de Lista Ativa</span>
      </div>
    </div>
  );
};
