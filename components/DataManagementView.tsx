
import React, { useRef } from 'react';
import { ScheduleData, DayGroup } from '../types';
import { downloadDatabase, getStats, normalizeData, allChairs, OPERATING_HOURS_START, OPERATING_HOURS_END, SLOT_INTERVAL, minutesToTime, timeToMinutes, parseDurationMinutes, SETUP_DURATION_MINUTES, getChairNumber } from '../constants';
import { Database, Download, Upload, FileSpreadsheet, FileJson, Trash2, ShieldCheck, HardDrive, RefreshCw, FileUp, Eraser, TableProperties, Users, Server, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DataManagementViewProps {
  data: ScheduleData;
  onUpdate: (data: ScheduleData) => void;
  onRestore: (file: File) => void;
  onOpenAIImport: () => void;
  onReset: () => void;
  activeTab: DayGroup;
  formattedDate: string;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({ 
  data, onUpdate, onRestore, onOpenAIImport, onReset, activeTab, formattedDate 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stats = getStats(data);
  const dbSize = (JSON.stringify(data).length / 1024).toFixed(2);

  // --- DOWNLOAD DA PLANILHA MODELO (TEMPLATE) ---
  const handleDownloadTemplate = () => {
      const wb = XLSX.utils.book_new();
      
      const headers = ["POLTRONA", "NOME", "HORARIO", "DIAS", "TIPO (HD/HDF)", "TEMPO DE SESSAO"];
      
      const exampleData = [
          ["01", "JOAO EXEMPLO DIARIO", "05:30", "SEG/TER/QUA/QUI/SEX/SAB", "HDF", "04:00"],
          ["02", "MARIA EXEMPLO TERCA", "10:30", "TER/QUI/SAB", "HD", "03:30"],
          ["Leito 09", "JOSE ACAMADO", "15:30", "SEG/QUA/SEX", "HDF", "04:00"],
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
      ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "Modelo de Importação");
      XLSX.writeFile(wb, "Modelo_Importacao_HemoScheduler.xlsx");
  };

  // --- LÓGICA DE EXPORTAÇÃO EXCEL AVANÇADA (RELATÓRIO) ---
  const handleExportExcelMap = () => {
    // ... (mesma lógica anterior)
    const wb = XLSX.utils.book_new();
    const currentStats = { total: 0, hd: 0, hdf: 0 };
    const rows: any[] = [];
    const sortedChairs = [...data[activeTab]].sort((a, b) => getChairNumber(a.chairNumber) - getChairNumber(b.chairNumber));

    sortedChairs.forEach(chair => {
        [chair.turn1, chair.turn2, chair.turn3].forEach((p, idx) => {
            if (p) {
                currentStats.total++;
                if (p.treatment === 'HDF') currentStats.hdf++; else currentStats.hd++;
                const endMins = timeToMinutes(p.startTime) + parseDurationMinutes(p.duration);
                const endTime = minutesToTime(endMins);
                rows.push([chair.chairNumber.replace(/[^0-9]/g, '').padStart(2, '0'), `${idx + 1}º Turno`, p.name, p.treatment, p.frequency, p.startTime, endTime, p.duration.replace(':00', 'h'), "AGENDADO"]);
            }
        });
    });

    const reportData = [["RELATÓRIO DE OCUPAÇÃO - " + activeTab.toUpperCase()], ["DATA REF:", formattedDate], [], ["POLTRONA", "TURNO", "PACIENTE", "TERAPIA", "FREQ", "INÍCIO", "TÉRMINO", "DURAÇÃO", "STATUS"], ...rows];
    const wsReport = XLSX.utils.aoa_to_sheet(reportData);
    wsReport['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsReport, "Lista Gerencial");

    const safeDate = formattedDate.replace(/\//g, '-').replace(/ /g, '_');
    XLSX.writeFile(wb, `HemoRelatorio_${activeTab.replace(/\//g, '-')}_${safeDate}.xlsx`);
  };

  return (
    <div className="bg-slate-50 min-h-full p-6 animate-appear overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center gap-4 mb-8">
            <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl">
                <Server size={32} />
            </div>
            <div>
                <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tight">HemoDB Control Center</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Painel de Controle do Banco de Dados Interno</p>
            </div>
        </div>

        {/* Status do Banco - Visual Reforçado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><HardDrive size={24}/></div>
                <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Armazenamento Local</p>
                    <p className="text-xl font-black text-slate-900">{dbSize} KB</p>
                    <p className="text-[9px] text-emerald-600 font-bold uppercase mt-1">Uso Otimizado</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Activity size={24}/></div>
                <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Integridade de Dados</p>
                    <p className="text-xl font-black text-slate-900">V9.0 (Estável)</p>
                    <p className="text-[9px] text-indigo-600 font-bold uppercase mt-1">Sincronia Ativa</p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Users size={24}/></div>
                <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Registros Totais</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-xl font-black text-slate-900">{stats.totalSlots}</p>
                        <p className="text-[9px] font-bold text-slate-400">Slots Ocupados</p>
                    </div>
                    <p className="text-[9px] text-blue-600 font-bold uppercase mt-1">{stats.uniquePatients} Pacientes Únicos</p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* CARTÃO 1: IMPORTAÇÃO E MODELO */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-lg overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500"></div>
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><TableProperties size={24} /></div>
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Injeção de Dados (XLSX)</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-medium leading-relaxed">
                        Importe dados em massa diretamente para o banco interno usando planilhas Excel. O sistema validará automaticamente os turnos e poltronas.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={handleDownloadTemplate} className="flex-1 py-4 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                            <Download size={16} /> Baixar Modelo
                        </button>
                        
                        <button onClick={onOpenAIImport} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
                            <Upload size={16} /> Carregar Lote
                        </button>
                    </div>
                </div>
            </div>

            {/* CARTÃO 2: BACKUP JSON */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-lg overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Database size={24} /></div>
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Snapshot de Segurança (JSON)</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-medium leading-relaxed">
                        Gere um arquivo de segurança criptografado contendo todo o estado atual do banco. Use para migrar ou restaurar em caso de falha.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={() => downloadDatabase(data)} className="flex-1 py-4 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2">
                            <Download size={16} /> Dump Database
                        </button>
                        
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-4 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 hover:text-emerald-600 transition-all flex items-center justify-center gap-2">
                            <Upload size={16} /> Restaurar Dump
                        </button>
                        <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && onRestore(e.target.files[0])} className="hidden" accept=".json" />
                    </div>
                </div>
            </div>
        </div>

        {/* ZONA DE PERIGO */}
        <div className="mt-12 pt-8 border-t border-slate-200">
             <div className="bg-rose-50 rounded-3xl p-6 border border-rose-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white text-rose-500 rounded-full shadow-sm"><Eraser size={20}/></div>
                    <div>
                        <h4 className="text-sm font-black uppercase text-rose-700">Comando de Expurgo (Reset Factory)</h4>
                        <p className="text-[10px] font-bold text-rose-400 uppercase">Ação irreversível: Limpa todas as tabelas do banco interno.</p>
                    </div>
                </div>
                <button onClick={onReset} className="px-6 py-3 bg-white text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                    EXECUTAR WIPE
                </button>
             </div>
        </div>

      </div>
    </div>
  );
};
