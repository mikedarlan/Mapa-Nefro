
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Activity, ShieldCheck, RefreshCw, PlusCircle, Sparkles, BrainCircuit, Users, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2, AlertOctagon, Database, Printer, Droplets, Zap, Lock, Download, Upload, FileJson, FileSpreadsheet, LayoutGrid, List, FileBarChart2, Eraser, SprayCan, Armchair, ZoomIn, ZoomOut, Maximize, Cloud, Clock, CalendarDays, Info, RotateCcw } from 'lucide-react';
import { INITIAL_DATA, normalizeData, OPERATING_HOURS_START, OPERATING_HOURS_END, SETUP_DURATION_MINUTES, SLOT_INTERVAL, timeToMinutes, minutesToTime, parseDurationMinutes, saveDataSecurely, initializeDataStore, wipeAllData, snapToGrid, getStats, allChairs, createEmptySchedule } from './constants';
import { DayGroup, Patient, ScheduleData } from './types';
import { PatientModal } from './components/PatientModal';
import { SpreadsheetView } from './components/SpreadsheetView';
import { AnalyticsView } from './components/AnalyticsView';
import { PrintableView } from './components/PrintableView';
import { AIListImporter } from './components/AIListImporter';
import { DataManagementView } from './components/DataManagementView';
import { PatientScheduleModal } from './components/PatientScheduleModal';
import * as XLSX from 'xlsx';

// --- TOOLTIP COMPONENT ---
const HoverTooltip: React.FC<{ info: { patient: Patient, x: number, y: number } | null }> = ({ info }) => {
  if (!info) return null;
  const { patient, x, y } = info;
  
  // Calcula término
  const startMins = timeToMinutes(patient.startTime);
  const durationMins = parseDurationMinutes(patient.duration);
  const endMins = startMins + durationMins;
  const endTime = minutesToTime(endMins);

  // Ajuste de posição para não sair da tela (viewport)
  const isRightOverflow = x + 250 > window.innerWidth;
  const isBottomOverflow = y + 150 > window.innerHeight;

  const style: React.CSSProperties = {
      position: 'fixed',
      left: isRightOverflow ? x - 260 : x + 20,
      top: isBottomOverflow ? y - 120 : y,
      zIndex: 9999,
  };

  return (
    <div style={style} className="bg-slate-900/95 text-white p-4 rounded-xl shadow-2xl backdrop-blur-md border border-slate-700 w-64 pointer-events-none animate-appear z-[9999]">
        <div className="flex items-start justify-between mb-3 border-b border-white/10 pb-2">
            <h4 className="font-black uppercase text-sm leading-snug text-white line-clamp-2">{patient.name}</h4>
            <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded ml-2 ${patient.treatment === 'HDF' ? 'bg-rose-500 text-white' : 'bg-indigo-500 text-white'}`}>
                {patient.treatment}
            </span>
        </div>
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <div className="p-1.5 bg-slate-800 rounded-lg text-indigo-400">
                   <Clock size={14} strokeWidth={2.5}/>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Horário</p>
                   <p className="text-xs font-black text-white font-mono">{patient.startTime} - {endTime}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="p-1.5 bg-slate-800 rounded-lg text-rose-400">
                   <Zap size={14} strokeWidth={2.5}/>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duração</p>
                   <p className="text-xs font-black text-white">{patient.duration.replace(':00', 'h')} de Sessão</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="p-1.5 bg-slate-800 rounded-lg text-emerald-400">
                   <CalendarDays size={14} strokeWidth={2.5}/>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Frequência</p>
                   <p className="text-xs font-black text-white">
                       {patient.frequency} 
                       {patient.specificDays && <span className="text-slate-500 font-bold ml-1 text-[10px]">({patient.specificDays.join(', ')})</span>}
                   </p>
                </div>
            </div>
        </div>
    </div>
  );
};

const App: React.FC = () => {
  // Navigation State
  const [viewMode, setViewMode] = useState<'dashboard' | 'spreadsheet' | 'analytics' | 'data' | 'print'>('dashboard');
  const [activeTab, setActiveTab] = useState<DayGroup>('SEG/QUA/SEX');
  
  // Data State
  const [data, setData] = useState<ScheduleData | null>(null);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'protected'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState('');
  
  // Persistence Ref (Critical for robust event handling)
  const dataRef = useRef<ScheduleData | null>(null);

  // View State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredInfo, setHoveredInfo] = useState<{ patient: Patient, x: number, y: number } | null>(null);
  
  // Date State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIImporterOpen, setIsAIImporterOpen] = useState(false);
  const [viewingSchedulePatientName, setViewingSchedulePatientName] = useState<string | null>(null);
  
  // Edit State
  const [editingChair, setEditingChair] = useState<string | null>(null);
  const [editingTurn, setEditingTurn] = useState<1 | 2 | 3 | null>(null);
  const [editingDay, setEditingDay] = useState<DayGroup | null>(null);

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<{ patient: Patient, originChair: string, originTurn: 1 | 2 | 3 } | null>(null);

  // === SYNC REF FOR EVENT LISTENERS ===
  useEffect(() => {
    // Keep ref somewhat in sync with state for general purposes
    dataRef.current = data;
  }, [data]);

  // === 1. BOOTSTRAP BLINDADO DO BANCO DE DADOS ===
  useEffect(() => {
    const init = () => {
        try {
            const { data: loadedData, restored, source } = initializeDataStore();
            setData(loadedData);
            dataRef.current = loadedData; // CRITICAL: Sync ref immediately on load
            setIsStoreReady(true);
            
            if (source === 'LEGACY_MIGRATION') {
                setLastMessage('Banco Atualizado (Migração)');
                // Force an immediate save to new structure just in case
                saveDataSecurely(loadedData, false);
            } else if (restored) {
                setLastMessage('Dados Recuperados');
            }
        } catch (e) {
            console.error("Boot error:", e);
            alert("Erro crítico ao conectar com HemoDB. Verifique o console.");
        }
    };
    init();
  }, []);

  // === 2. PERSISTÊNCIA CONTÍNUA (AUTO-SAVE) ===
  useEffect(() => {
    if (!isStoreReady || !data) return;

    setSaveStatus('saving');
    
    // Timer curto para salvar quase que instantaneamente enquanto digita/arrasta
    const timer = setTimeout(() => {
        // Tenta salvar com allowEmpty = false (proteção ativada)
        const result = saveDataSecurely(data, false);
        
        if (result.success) {
            setSaveStatus('saved');
            const now = new Date();
            setLastSavedTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            
            // Mantém o status "Saved" visível por mais tempo para dar segurança ao usuário
            setTimeout(() => setSaveStatus('idle'), 3000);
        } else {
            if (result.error?.includes("Proteção")) {
                setSaveStatus('protected');
                console.warn("Auto-save bloqueado pela proteção de dados.");
            } else {
                setSaveStatus('error');
            }
        }
    }, 500); // Reduzido de 800ms para 500ms para maior reatividade

    return () => clearTimeout(timer);
  }, [data, isStoreReady]);

  // === 3. PROTEÇÃO CONTRA FECHAMENTO DE ABA E SINCRONIA ===
  useEffect(() => {
    const handleInstantSave = () => {
        // Usa o ref para garantir acesso aos dados mais recentes sem recriar o listener
        const currentData = dataRef.current;
        if (currentData && isStoreReady) {
            const result = saveDataSecurely(currentData, false);
            if (result.success) {
                console.log("Salvamento de emergência executado com sucesso.");
            }
        }
    };

    // Detecta alterações em outras abas
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key && e.key.includes('HEMO_PRO')) {
            console.log("Detectada alteração externa no banco de dados. Sincronizando...");
            // Re-read from store carefully
            const { data: newData } = initializeDataStore();
            setData(newData);
            dataRef.current = newData; // Update ref!
            setLastMessage("Sincronizado via Aba Externa");
        }
    };

    // Salva ao trocar de aba (ex: celular minimizando app)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            handleInstantSave();
        }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleInstantSave);
    window.addEventListener("storage", handleStorageChange);

    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleInstantSave);
        window.removeEventListener("storage", handleStorageChange);
    };
  }, [isStoreReady]); 


  // Função para atualizar o estado local + forçar update da interface
  const updateLocalData = (newData: ScheduleData) => {
    // 1. Update Ref FIRST (Sync) to protect against immediate closure
    dataRef.current = newData;
    // 2. Trigger React Render
    setData(newData);
  };

  const handleForceReload = () => {
      const { data: loadedData } = initializeDataStore();
      setData(loadedData);
      setSaveStatus('idle');
      alert("Dados recarregados do banco de dados local.");
  };

  const handleResetDatabase = () => {
    if (window.confirm("ATENÇÃO:\n\nTem certeza que deseja APAGAR TODOS os pacientes?\nEsta ação limpará a grade para iniciar do zero.")) {
        // 1. Zera dados localmente
        const emptyData = createEmptySchedule();
        
        // 2. Força o salvamento com flag 'allowEmpty: true' para burlar a proteção de dados
        const result = saveDataSecurely(emptyData, true);
        
        if (result.success) {
            // 3. Atualiza UI imediatamente
            updateLocalData(emptyData);
            setLastMessage('Banco Zerado');
            alert("Lista limpa com sucesso!");
        } else {
            alert("Erro ao limpar banco: " + result.error);
        }
    }
  };

  // Logic Helpers
  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(newDate);
  };
  const handleGoToday = () => setSelectedDate(new Date());

  const adjustZoom = (delta: number) => {
      setZoomLevel(prev => {
          const newZoom = prev + delta;
          return Math.max(0.5, Math.min(1.3, newZoom));
      });
  };

  useEffect(() => {
    const day = selectedDate.getDay();
    if (day === 1 || day === 3 || day === 5) setActiveTab('SEG/QUA/SEX');
    else if (day === 2 || day === 4 || day === 6) setActiveTab('TER/QUI/SÁB');
  }, [selectedDate]);

  const formattedDate = useMemo(() => selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }), [selectedDate]);
  const weekDayName = useMemo(() => selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' }), [selectedDate]);

  // === MATRIX CALCULATION (OTIMIZADO) ===
  const occupancyMatrix = useMemo(() => {
    if (viewMode !== 'dashboard' || !data) return {};

    const matrix: Record<string, Record<number, any>> = {};

    data[activeTab].forEach(chair => {
      matrix[chair.chairNumber] = {};
    });

    // 1. PRIMEIRA PASSADA: Pacientes
    data[activeTab].forEach(chair => {
      const patients = [chair.turn1, chair.turn2, chair.turn3].filter(Boolean) as Patient[];
      patients.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      patients.forEach((p) => {
        const startMins = snapToGrid(timeToMinutes(p.startTime));
        const durMins = parseDurationMinutes(p.duration);
        const patientRowSpan = Math.ceil(durMins / SLOT_INTERVAL);
        
        matrix[chair.chairNumber][startMins] = { 
            type: 'patient', 
            patient: p, 
            rowSpan: patientRowSpan 
        };

        for (let i = 1; i < patientRowSpan; i++) {
          matrix[chair.chairNumber][startMins + (i * SLOT_INTERVAL)] = { type: 'blocked_patient' };
        }
      });
    });

    // 2. SEGUNDA PASSADA: Setup
    data[activeTab].forEach(chair => {
      const patients = [chair.turn1, chair.turn2, chair.turn3].filter(Boolean) as Patient[];
      patients.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      patients.forEach((p) => {
        const startMins = snapToGrid(timeToMinutes(p.startTime));
        const durMins = parseDurationMinutes(p.duration);
        const patientRowSpan = Math.ceil(durMins / SLOT_INTERVAL);
        const setupStart = startMins + (patientRowSpan * SLOT_INTERVAL);
        const maxSetupSlots = Math.ceil(SETUP_DURATION_MINUTES / SLOT_INTERVAL); 
        
        if (setupStart < (OPERATING_HOURS_END * 60)) {
            let availableSlots = 0;
            for(let k = 0; k < maxSetupSlots; k++) {
                const checkSlot = setupStart + (k * SLOT_INTERVAL);
                if (checkSlot >= (OPERATING_HOURS_END * 60)) break;
                const cell = matrix[chair.chairNumber][checkSlot];
                if (cell && (cell.type === 'patient' || cell.type === 'blocked_patient')) break; 
                availableSlots++;
            }
            if (availableSlots > 0) {
                matrix[chair.chairNumber][setupStart] = { type: 'setup', rowSpan: availableSlots };
                for (let i = 1; i < availableSlots; i++) {
                    matrix[chair.chairNumber][setupStart + (i * SLOT_INTERVAL)] = { type: 'blocked_setup' };
                }
            }
        }
      });
    });
    return matrix;
  }, [data, activeTab, viewMode]);

  const timeSlots = useMemo(() => {
    if (viewMode !== 'dashboard') return []; 
    const slots = [];
    for (let t = OPERATING_HOURS_START * 60; t <= OPERATING_HOURS_END * 60; t += SLOT_INTERVAL) {
      slots.push({ timeStr: minutesToTime(t), minutes: t, isFullHour: t % 60 === 0 });
    }
    return slots;
  }, [viewMode]);

  // --- HANDLERS ---
  const handleSlotClick = (chairNumber: string, timeStr: string, existingPatient?: Patient) => {
    setEditingChair(chairNumber);
    setEditingDay(activeTab);
    if (existingPatient) {
      const row = data![activeTab].find(c => c.chairNumber === chairNumber);
      if (row?.turn1?.id === existingPatient.id) setEditingTurn(1);
      else if (row?.turn2?.id === existingPatient.id) setEditingTurn(2);
      else if (row?.turn3?.id === existingPatient.id) setEditingTurn(3);
    } else {
      const mins = timeToMinutes(timeStr);
      setEditingTurn(mins < 600 ? 1 : (mins < 900 ? 2 : 3));
    }
    setIsModalOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, patient: Patient, chair: string, turn: 1 | 2 | 3) => {
    setDraggedItem({ patient, originChair: chair, originTurn: turn });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetChair: string, targetTimeStr: string) => {
    e.preventDefault();
    if (!draggedItem || !data) return;

    const newData = JSON.parse(JSON.stringify(data));
    const currentScale = newData[activeTab];

    const sourceChairObj = currentScale.find((c: any) => c.chairNumber === draggedItem.originChair);
    if (sourceChairObj) {
      sourceChairObj[`turn${draggedItem.originTurn}`] = null;
    }

    const targetChairObj = currentScale.find((c: any) => c.chairNumber === targetChair);
    if (targetChairObj) {
      let targetTurn: 1 | 2 | 3 | null = null;
      if (!targetChairObj.turn1) targetTurn = 1;
      else if (!targetChairObj.turn2) targetTurn = 2;
      else if (!targetChairObj.turn3) targetTurn = 3;

      if (targetTurn) {
        targetChairObj[`turn${targetTurn}`] = {
          ...draggedItem.patient,
          startTime: targetTimeStr 
        };
        updateLocalData(newData);
      } else {
        alert("A poltrona de destino está lotada (Máximo 3 turnos). Não foi possível mover.");
      }
    }
    setDraggedItem(null);
  };

  const handleNewPatient = () => {
    setEditingChair(null);
    setEditingTurn(null);
    setEditingDay(activeTab);
    setIsModalOpen(true);
  };

  const handleSavePatient = (patient: Patient | null, chairNum: string | string[], turnNum: 1 | 2 | 3, dayGroup: DayGroup) => {
    if (!data) return;
    const newData = JSON.parse(JSON.stringify(data));
    
    // 1. CLEANUP (Remover paciente do slot onde foi clicado para edição)
    // Nota: Isso apenas limpa o slot "ativo". Se for uma edição de um paciente Diário, 
    // a outra instância (na outra aba) só será sobrescrita se o novo agendamento a cobrir,
    // ou se o usuário navegar até lá e editar.
    if (editingChair && editingDay && editingTurn) {
      const oldChair = newData[editingDay].find((c: any) => c.chairNumber === editingChair);
      if (oldChair) (oldChair as any)[`turn${editingTurn}`] = null;
    }

    // 2. INSERT / UPDATE
    if (patient) {
        const chairsToUpdate = Array.isArray(chairNum) ? chairNum : [chairNum];
        
        // Determina quais grupos devem receber este paciente com base nos dias selecionados
        const days = patient.specificDays || [];
        const saveToSQS = days.some(d => ['SEG', 'QUA', 'SEX'].includes(d));
        const saveToTQS = days.some(d => ['TER', 'QUI', 'SÁB'].includes(d));

        const targetGroups: DayGroup[] = [];
        // Se tem dias específicos, usa a lógica de dias
        if (days.length > 0) {
            if (saveToSQS) targetGroups.push('SEG/QUA/SEX');
            if (saveToTQS) targetGroups.push('TER/QUI/SÁB');
        } else {
            // Fallback: usa o grupo atual (comportamento padrão legado)
            targetGroups.push(dayGroup);
        }

        // Garante que pelo menos um grupo receba (caso array de dias esteja vazio por erro)
        if (targetGroups.length === 0) targetGroups.push(dayGroup);

        targetGroups.forEach(group => {
            chairsToUpdate.forEach(targetChairNum => {
                const targetChair = newData[group].find((c: any) => c.chairNumber === targetChairNum);
                if (targetChair) {
                    const patientClone = { ...patient };
                    // Mesma ID para rastreamento cross-tab
                    (targetChair as any)[`turn${turnNum}`] = patientClone;
                }
            });
        });
    }

    updateLocalData(newData);
    setIsModalOpen(false);
  };

  const handleRestoreBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target?.result as string);
            const normalized = normalizeData(json);
            if (window.confirm(`ATENÇÃO: Isso irá substituir os dados atuais pelos do backup.\n\nDeseja continuar?`)) {
                updateLocalData(normalized);
                alert("Backup restaurado e salvo no banco de dados.");
            }
        } catch (err) {
            alert("Arquivo de backup inválido.");
        }
    };
    reader.readAsText(file);
  };

  const handleExportExcel = () => {
    if (!data) return;
    const mapRows = [
      ["MAPA DE SALA - HEMODIÁLISE"],
      ["Data:", formattedDate],
      ["Escala:", activeTab],
      [""],
      ["Horário", ...data[activeTab].map(c => `Polt. ${c.chairNumber}`)]
    ];

    timeSlots.forEach(slot => {
        const row = [slot.timeStr];
        data[activeTab].forEach(chair => {
            const cell = occupancyMatrix[chair.chairNumber]?.[slot.minutes];
            let val = "";
            if (cell?.type === 'patient') val = `${cell.patient.name} (${cell.patient.treatment})`;
            else if (cell?.type === 'blocked_patient') val = "ocupado";
            else if (cell?.type === 'setup' || cell?.type === 'blocked_setup') val = "HIGIENIZAÇÃO";
            row.push(val);
        });
        mapRows.push(row);
    });
    
    const wb = XLSX.utils.book_new();
    const wsMap = XLSX.utils.aoa_to_sheet(mapRows);
    wsMap['!cols'] = [{wch: 10}, ...data[activeTab].map(() => ({wch: 25}))];
    XLSX.utils.book_append_sheet(wb, wsMap, "Mapa Visual");
    const safeDate = formattedDate.replace(/\//g, '-').replace(/ /g, '_');
    XLSX.writeFile(wb, `HemoMap_Completo_${activeTab.replace(/\//g, '-')}_${safeDate}.xlsx`);
  };

  if (!isStoreReady || !data) {
    return (
     <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-6">
       <div className="relative"><div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div><Database size={64} className="text-indigo-500 relative z-10 animate-bounce" /></div>
       <div className="text-center space-y-2"><h1 className="text-2xl font-black uppercase tracking-widest">HemoScheduler Fortress</h1><p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] animate-pulse">Conectando ao HemoDB V2...</p></div>
     </div>
    );
  }

  const editingPatientData = (editingChair && editingDay && editingTurn) ? (data[editingDay].find(c => c.chairNumber === editingChair) as any)?.[`turn${editingTurn}`] : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      {/* HEADER ESCURO (PRO) - Compacto e Vibrante */}
      <header className="h-16 bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 border-b border-indigo-800 flex items-center justify-between px-4 shrink-0 z-50 shadow-md relative print:hidden">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-1.5 rounded-xl text-white shadow-lg backdrop-blur-sm"><Activity size={18} strokeWidth={2.5}/></div>
          <div>
            <h1 className="text-xs font-black uppercase text-white tracking-tighter leading-none">HemoScheduler <span className="text-indigo-200">Pro</span></h1>
            <div className="flex items-center gap-2 mt-0.5">
               {saveStatus === 'saving' && <p className="text-[8px] text-amber-300 font-bold uppercase tracking-widest flex items-center gap-1"><RefreshCw size={8} className="animate-spin" /> Gravando...</p>}
               {saveStatus === 'saved' && <p className="text-[8px] text-emerald-300 font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={8} /> Salvo {lastSavedTime}</p>}
               {saveStatus === 'error' && <p className="text-[8px] text-rose-300 font-bold uppercase tracking-widest flex items-center gap-1"><AlertOctagon size={8} /> Erro</p>}
               {saveStatus === 'protected' && (
                   <button onClick={handleForceReload} className="text-[8px] text-cyan-300 font-bold uppercase tracking-widest flex items-center gap-1 bg-white/10 px-2 rounded hover:bg-white/20 transition-colors animate-pulse">
                       <ShieldCheck size={8} /> Protegido (Clique p/ Recarregar)
                   </button>
               )}
               {saveStatus === 'idle' && lastSavedTime && <p className="text-[8px] text-indigo-200 font-bold uppercase tracking-widest flex items-center gap-1"><Cloud size={8} /> Sync ({lastSavedTime})</p>}
            </div>
          </div>
        </div>

        {/* Central Navigation */}
        <div className="flex items-center gap-2">
           <nav className="hidden md:flex bg-black/20 p-1 rounded-xl gap-1 overflow-x-auto max-w-[50vw] custom-scrollbar backdrop-blur-sm">
             <button onClick={() => setViewMode('dashboard')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'dashboard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:text-white hover:bg-white/10'}`}>
                <LayoutGrid size={12}/> <span className="hidden lg:inline">Mapa</span>
             </button>
             <button onClick={() => setViewMode('spreadsheet')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'spreadsheet' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-100 hover:text-white hover:bg-white/10'}`}>
                <List size={12}/> <span className="hidden lg:inline">Lista</span>
             </button>
             <button onClick={() => setViewMode('analytics')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'analytics' ? 'bg-white text-rose-600 shadow-sm' : 'text-indigo-100 hover:text-white hover:bg-white/10'}`}>
                <BrainCircuit size={12}/> <span className="hidden lg:inline">IA & BI</span>
             </button>
             <button onClick={() => setViewMode('data')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'data' ? 'bg-white text-indigo-900 shadow-sm' : 'text-indigo-100 hover:text-white hover:bg-white/10'}`}>
                <Database size={12}/> <span className="hidden lg:inline">Dados</span>
             </button>
           </nav>

           <div className="md:hidden">
              <select 
                value={viewMode} 
                onChange={(e) => setViewMode(e.target.value as any)}
                className="bg-indigo-900 text-white text-[10px] font-black uppercase rounded-lg px-2 py-2 outline-none border-none max-w-[80px]"
              >
                <option value="dashboard">Mapa</option>
                <option value="spreadsheet">Lista</option>
                <option value="analytics">IA</option>
                <option value="data">Dados</option>
              </select>
           </div>

           <button onClick={handleNewPatient} className="flex items-center gap-2 px-3 py-2 bg-white text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-lg active:scale-95 whitespace-nowrap">
              <PlusCircle size={14} /> <span className="hidden lg:inline">Novo</span>
           </button>
           
           {viewMode === 'dashboard' && (
             <div className="flex gap-1">
                <button onClick={handleExportExcel} className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Exportar Excel">
                  <FileSpreadsheet size={18} />
                </button>
                <button onClick={() => setViewMode('print')} className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Imprimir">
                  <Printer size={18} />
                </button>
             </div>
           )}
        </div>
      </header>

      <main className={`flex-1 overflow-hidden ${viewMode === 'dashboard' ? 'p-0 bg-slate-100' : 'p-4'} print:p-0 print:overflow-visible relative`}>
        
        {viewMode === 'dashboard' && (
          <div className="h-full flex flex-col relative animate-appear">
            
            {/* Barra de Controle de Mapa Compacta */}
            <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex justify-between items-center shrink-0 z-20 shadow-sm h-12">
               <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar">
                   <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                       <button onClick={() => setActiveTab('SEG/QUA/SEX')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'SEG/QUA/SEX' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Seg/Qua/Sex</button>
                       <button onClick={() => setActiveTab('TER/QUI/SÁB')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'TER/QUI/SÁB' ? 'bg-white text-rose-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Ter/Qui/Sáb</button>
                   </div>
                   <div className="h-4 w-px bg-slate-200 mx-2 shrink-0"></div>
                   <div className="flex items-center gap-0.5 text-slate-400 shrink-0">
                        <button onClick={() => adjustZoom(-0.1)} className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-700 transition-colors" title="Diminuir Zoom"><ZoomOut size={14}/></button>
                        <span className="text-[9px] font-black min-w-[30px] text-center">{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={() => adjustZoom(0.1)} className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-700 transition-colors" title="Aumentar Zoom"><ZoomIn size={14}/></button>
                        <button onClick={() => setZoomLevel(1)} className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-700 transition-colors ml-1" title="Ajustar à Tela"><Maximize size={14}/></button>
                   </div>
               </div>
               <div className="hidden sm:flex items-center gap-3 shrink-0 mr-1">
                   {/* LEGENDA COMPACTA ATUALIZADA */}
                   <div className="flex items-center gap-1.5">
                       <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-1 ring-indigo-200"></div>
                       <span className="text-[9px] font-black uppercase text-slate-600 tracking-wide">HD</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                       <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-1 ring-rose-200"></div>
                       <span className="text-[9px] font-black uppercase text-slate-600 tracking-wide">HDF</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                       <div className="w-2.5 h-2.5 rounded bg-red-100 border border-red-800 relative overflow-hidden">
                           <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #7f1d1d 0, #7f1d1d 1px, transparent 1px, transparent 4px)' }}></div>
                       </div>
                       <span className="text-[9px] font-black uppercase text-slate-400 tracking-wide">Setup</span>
                   </div>
               </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar bg-slate-100 relative">
              <div style={{ 
                  transform: `scale(${zoomLevel})`, 
                  transformOrigin: 'top left',
                  width: `${100 / zoomLevel}%`, 
                  height: `${100 / zoomLevel}%`
              }}>
                <table className="dashboard-table">
                    <thead className="sticky top-0 z-40 shadow-md">
                    <tr>
                        <th className="sticky left-0 top-0 z-50 bg-white border-r border-b border-slate-200 p-0 w-14 text-center font-black text-slate-400 text-[9px] uppercase tracking-[0.05em] h-10 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)]">
                            Hora
                        </th>
                        {data[activeTab].map((chair) => (
                        <th key={chair.chairNumber} className="p-0 border-b border-r border-slate-700 text-center bg-slate-800 text-white h-10 min-w-[68px]">
                            <span className="text-[8px] font-black uppercase tracking-wider block text-slate-400 mb-0.5 leading-none">Polt.</span>
                            <span className="text-xs font-black uppercase tracking-widest block leading-none">{chair.chairNumber.replace('Leito', 'L')}</span>
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {timeSlots.map((slot) => (
                        <tr key={slot.minutes} className={`${slot.isFullHour ? 'hour-row' : ''}`}>
                        <td className={`sticky left-0 z-30 border-r border-slate-200 p-0 text-center transition-all h-8 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] ${slot.isFullHour ? 'text-[10px] font-black text-slate-800 bg-slate-50' : 'text-[9px] font-bold text-slate-300 bg-white'}`}>
                            {slot.timeStr}
                        </td>
                        {data[activeTab].map((chair) => {
                            const cell = occupancyMatrix[chair.chairNumber]?.[slot.minutes];
                            
                            if (cell?.type === 'blocked_patient' || cell?.type === 'blocked_setup') return null;
                            
                            if (!cell) {
                            return (
                                <td 
                                key={`${chair.chairNumber}-${slot.minutes}`} 
                                className={`p-0 group transition-all cursor-pointer h-8 border-b border-r border-slate-200 relative overflow-hidden
                                    ${draggedItem ? 'bg-indigo-50/40 border-dashed border-indigo-300' : 'bg-slate-50/30 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-[inset_0_0_0_2px_rgba(16,185,129,0.2)]'}
                                `}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, chair.chairNumber, slot.timeStr)}
                                >
                                {/* Indicador Visual de Vaga */}
                                {!draggedItem && (
                                    <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[radial-gradient(#64748b_1px,transparent_1px)] [background-size:6px_6px]"></div>
                                )}
                                
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 gap-1.5 bg-emerald-50/80 backdrop-blur-[1px]">
                                    <div className="p-0.5 bg-emerald-200 rounded-full animate-bounce">
                                        <PlusCircle size={10} className="text-emerald-600" strokeWidth={3} />
                                    </div>
                                    <span className="text-[9px] font-black uppercase text-emerald-700 tracking-widest shadow-sm">Livre</span>
                                </div>
                                
                                {/* Botão invisível para clique */}
                                <button onClick={() => handleSlotClick(chair.chairNumber, slot.timeStr)} className="absolute inset-0 w-full h-full z-20"></button>
                                </td>
                            );
                            }

                            if (cell.type === 'patient') {
                            const isHDF = cell.patient.treatment === 'HDF';
                            const originTurn = chair.turn1?.id === cell.patient.id ? 1 : chair.turn2?.id === cell.patient.id ? 2 : 3;
                            
                            // VISUAL ATUALIZADO: ÍNDIGO (HD) E ROSE (HDF) - VIBRANTE
                            const bgClass = isHDF 
                                ? 'bg-rose-100 border-l-[4px] border-rose-600 hover:bg-rose-200' 
                                : 'bg-indigo-100 border-l-[4px] border-indigo-600 hover:bg-indigo-200';
                            
                            const textClass = isHDF ? 'text-rose-950' : 'text-indigo-950';
                            const labelClass = isHDF ? 'text-rose-800/80' : 'text-indigo-800/80';

                            return (
                                <td 
                                key={`${chair.chairNumber}-${slot.minutes}`} 
                                rowSpan={cell.rowSpan} 
                                className="p-0 border-r border-b-0 border-slate-200 align-top relative"
                                style={{ height: 1 }} // Força altura relativa
                                >
                                <div className="w-full h-full p-[1px]">
                                    <div 
                                        draggable 
                                        onDragStart={(e) => handleDragStart(e, cell.patient, chair.chairNumber, originTurn)}
                                        onClick={() => handleSlotClick(chair.chairNumber, slot.timeStr, cell.patient)}
                                        onMouseEnter={(e) => setHoveredInfo({ patient: cell.patient, x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHoveredInfo(null)}
                                        className={`w-full h-full rounded transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden flex flex-col justify-center ${bgClass}`}
                                    >
                                        <div className="px-1 py-0.5 relative z-10 flex flex-col h-full justify-center pointer-events-none">
                                            <p className={`font-black text-xs uppercase leading-tight truncate ${textClass}`}>
                                                {cell.patient.name.split(' ')[0]} {cell.patient.name.split(' ').length > 1 ? cell.patient.name.split(' ')[1].substring(0,1)+'.' : ''}
                                            </p>
                                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                <span className={`text-[9px] font-black ${labelClass}`}>{cell.patient.duration.replace(':00', 'h')}</span>
                                                {cell.patient.frequency !== '3x' && (
                                                    <span className={`text-[8px] font-black px-1 rounded leading-none bg-white/50`}>{cell.patient.frequency.substring(0,3)}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </td>
                            );
                            }

                            if (cell.type === 'setup') {
                            return (
                                <td 
                                key={`${chair.chairNumber}-${slot.minutes}`} 
                                rowSpan={cell.rowSpan} 
                                className="p-0 border-r border-b-0 border-slate-200 align-top relative"
                                style={{ height: 1 }}
                                >
                                <div className="w-full h-full p-[1px]">
                                    {/* VISUAL SETUP ATUALIZADO: VERMELHO ESCURO C/ LISTRAS (ALERTA) */}
                                    <div className="w-full h-full rounded relative overflow-hidden flex flex-col items-center justify-center group border border-red-800/30 bg-red-100">
                                        <div className="absolute inset-0 opacity-20" style={{ 
                                            backgroundImage: 'repeating-linear-gradient(45deg, #7f1d1d 0, #7f1d1d 2px, transparent 2px, transparent 8px)' 
                                        }}></div>
                                         <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <SprayCan size={12} className="text-red-900" />
                                         </div>
                                    </div>
                                </div>
                                </td>
                            );
                            }
                            return null;
                        })}
                        </tr>
                    ))}
                    </tbody>
                </table>
              </div>
            </div>
            
            {/* Tooltip Render */}
            <HoverTooltip info={hoveredInfo} />
            
          </div>
        )}
        
        {viewMode === 'spreadsheet' && (
          <SpreadsheetView 
             data={data} 
             activeTab={activeTab} 
             onUpdate={(d) => updateLocalData(d)} 
             onEdit={(c,t,g) => {setEditingChair(c); setEditingTurn(t); setEditingDay(g); setIsModalOpen(true);}} 
             onViewSchedule={(name) => setViewingSchedulePatientName(name)}
             onReset={handleResetDatabase}
          />
        )}
        
        {viewMode === 'analytics' && (
            <AnalyticsView 
                data={data} 
                activeTab={activeTab} 
                onPatientClick={(chair, turn, group) => {
                    setViewMode('dashboard');
                    setActiveTab(group);
                    setEditingChair(chair);
                    setEditingTurn(turn);
                    setEditingDay(group);
                    setIsModalOpen(true);
                }}
            />
        )}
        
        {viewMode === 'data' && (
            <DataManagementView 
                data={data} 
                onUpdate={updateLocalData} 
                onRestore={handleRestoreBackup}
                onOpenAIImport={() => setIsAIImporterOpen(true)}
                onReset={handleResetDatabase}
                activeTab={activeTab}
                formattedDate={formattedDate}
            />
        )}
        
        {viewMode === 'print' && <PrintableView data={data} activeTab={activeTab} dateLabel={formattedDate} weekDay={weekDayName} />}
      </main>

      <PatientModal 
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSavePatient} initialData={editingPatientData} 
        shiftLabel={activeTab} currentChair={editingChair} currentTurn={editingTurn} initialDayGroup={editingDay || activeTab}
      />

      <PatientScheduleModal 
        isOpen={!!viewingSchedulePatientName}
        onClose={() => setViewingSchedulePatientName(null)}
        patientName={viewingSchedulePatientName}
        data={data}
        onEditSession={(chair, turn, dayGroup) => {
          setViewingSchedulePatientName(null);
          setEditingChair(chair);
          setEditingTurn(turn);
          setEditingDay(dayGroup);
          setIsModalOpen(true);
        }}
      />

      <AIListImporter 
        isOpen={isAIImporterOpen} 
        onClose={() => setIsAIImporterOpen(false)} 
        onImport={(newData) => { updateLocalData(newData); setIsAIImporterOpen(false); }} 
        currentData={data}
        activeTab={activeTab}
      />
    </div>
  );
};

export default App;
