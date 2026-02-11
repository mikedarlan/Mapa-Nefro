
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { X, Sparkles, Loader2, BrainCircuit, ClipboardList, FileUp, FileSpreadsheet, CheckCircle2, AlertOctagon, Download } from 'lucide-react';
import { ScheduleData, DayGroup, Patient, TreatmentType, FrequencyType } from '../types';
import { cleanAIJsonResponse, timeToMinutes, minutesToTime, OPERATING_HOURS_START, normalizeString, allChairs, parseDurationMinutes } from '../constants';
import * as XLSX from 'xlsx';

interface AIListImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ScheduleData) => void;
  currentData: ScheduleData;
  activeTab: DayGroup;
}

export const AIListImporter: React.FC<AIListImporterProps> = ({ isOpen, onClose, onImport, currentData, activeTab }) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // --- FUNÇÕES DE AJUDA ROBUSTAS ---

  const excelDateToJSDate = (serial: number) => {
    // Ajuste para datas/horas do Excel (O Excel conta dias desde 1900, mas trata horas como fração)
    const total_seconds = Math.floor(serial * 86400);
    const total_minutes = Math.floor(total_seconds / 60);
    return minutesToTime(total_minutes);
  };

  const parseExcelTime = (val: any): string => {
    if (val === undefined || val === null) return "00:00";
    
    // Caso 1: Número decimal do Excel (Ex: 0.2291666 -> 05:30)
    if (typeof val === 'number') {
       // Se for maior que 1, pode ser data+hora, pegamos só a fração decimal
       const fraction = val % 1; 
       // Se for muito próximo de 0, assume 0
       if (fraction < 0.0001) return "00:00";
       return excelDateToJSDate(fraction);
    }
    
    const strVal = val.toString().trim();
    
    // Caso 2: String formatada HH:MM:SS ou HH:MM
    if (strVal.match(/^\d{1,2}:\d{2}/)) {
        return strVal.substring(0, 5).padStart(5, '0');
    }
    
    // Caso 3: Números inteiros sem formatação (Ex: 530 -> 05:30, 1400 -> 14:00)
    if (strVal.match(/^\d+$/)) {
        if (strVal.length <= 2) return `${strVal.padStart(2,'0')}:00`; // Ex: "8" -> "08:00"
        if (strVal.length === 3) return `0${strVal[0]}:${strVal.slice(1)}`; // Ex: "530" -> "05:30"
        if (strVal.length === 4) return `${strVal.slice(0,2)}:${strVal.slice(2)}`; // Ex: "1400" -> "14:00"
    }

    // Caso 4: Formato humano (Ex: "5h", "14h30")
    if (strVal.toLowerCase().includes('h')) {
        const parts = strVal.toLowerCase().split('h');
        const h = parts[0].trim().padStart(2, '0');
        const m = parts[1] ? parts[1].trim().padEnd(2, '0').substring(0,2) : '00';
        return `${h}:${m}`;
    }

    return "00:00";
  };

  const normalizeHeader = (h: string) => normalizeString(h).replace(/[^A-Z0-9]/g, '');

  const processDirectExcel = (jsonData: any[]): boolean => {
    if (!jsonData || jsonData.length === 0) return false;

    console.log("Iniciando processamento de dados brutos:", jsonData);

    // Mapeamento de Colunas (Prioridade para o Modelo Padrão)
    const keys = Object.keys(jsonData[0]);
    
    const findKey = (candidates: string[]) => {
        return keys.find(k => candidates.some(c => normalizeHeader(k).includes(normalizeHeader(c))));
    };

    const colName = findKey(['NOME', 'PACIENTE', 'NOMES']);
    const colChair = findKey(['POLTRONA', 'CADEIRA', 'LOCAL', 'POLT', 'NR', 'LEITO']);
    const colTime = findKey(['HORARIO', 'HORA', 'INICIO', 'H.INICIO']);
    const colDays = findKey(['DIAS', 'ESCALA', 'FREQ', 'SEMANA']);
    const colTreat = findKey(['TIPO', 'TRATAMENTO', 'TERAPIA']);
    const colDur = findKey(['TEMPO', 'DURACAO', 'SESSAO']);

    if (!colName) {
        setError("Não foi possível encontrar a coluna 'NOME' ou 'PACIENTE'. Verifique o cabeçalho.");
        return false;
    }

    try {
      const updatedData = JSON.parse(JSON.stringify(currentData));
      let processedCount = 0;

      jsonData.forEach((row: any, index) => {
        // 1. EXTRAÇÃO DE DADOS
        const rawName = row[colName];
        if (!rawName) return; // Pula linha vazia

        const name = String(rawName).trim().toUpperCase();
        
        // --- CORREÇÃO DE POLTRONA ---
        let chairId = "99"; 
        if (colChair && row[colChair]) {
            const val = String(row[colChair]).toUpperCase();
            const numMatch = val.match(/(\d+)/);
            if (numMatch) {
                let num = parseInt(numMatch[0], 10);
                if (num === 9) {
                    chairId = "Leito 09"; 
                } else {
                    const official = allChairs.find(c => {
                        const cNum = c.match(/(\d+)/);
                        return cNum && parseInt(cNum[0], 10) === num;
                    });
                    if (official) chairId = official;
                    else chairId = num.toString().padStart(2, '0');
                }
            }
        }

        // Horário
        const startTime = colTime ? parseExcelTime(row[colTime]) : "05:30";
        const startMinutes = timeToMinutes(startTime);

        // Duração
        const duration = colDur ? parseExcelTime(row[colDur]) : "04:00";
        
        // Tratamento
        let treatment: TreatmentType = 'HD';
        if (colTreat && row[colTreat]) {
            const t = String(row[colTreat]).toUpperCase();
            if (t.includes('HDF')) treatment = 'HDF';
            else if (t.includes('DP')) treatment = 'DP';
        }

        // --- CORREÇÃO DE DIAS ---
        let frequency: FrequencyType = '3x';
        let targetGroups: DayGroup[] = [];
        let specificDays: string[] = [];

        if (colDays && row[colDays]) {
            const d = normalizeString(String(row[colDays]));
            
            // Check individual days
            const isSeg = d.includes('SEG') || d.includes('2');
            const isTer = d.includes('TER') || d.includes('3');
            const isQua = d.includes('QUA') || d.includes('4');
            const isQui = d.includes('QUI') || d.includes('5');
            const isSex = d.includes('SEX') || d.includes('6');
            const isSab = d.includes('SAB') || d.includes('SA');
            const isDiario = d.includes('DIARIO') || d.includes('TODOS') || d.includes('6X') || (isSeg && isTer && isQua && isQui && isSex);

            if (isDiario) {
                frequency = 'Diário';
                targetGroups = ['SEG/QUA/SEX', 'TER/QUI/SÁB'];
                specificDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
            } else {
                // Tenta inferir se é SQS ou TQS
                if (isSeg || isQua || isSex) targetGroups.push('SEG/QUA/SEX');
                if (isTer || isQui || isSab) targetGroups.push('TER/QUI/SÁB');
                
                // Deduplicate
                targetGroups = [...new Set(targetGroups)];

                // Se não detectou nada, usa a aba ativa como fallback
                if (targetGroups.length === 0) targetGroups.push(activeTab);

                // Monta dias específicos
                if (isSeg) specificDays.push('SEG');
                if (isTer) specificDays.push('TER');
                if (isQua) specificDays.push('QUA');
                if (isQui) specificDays.push('QUI');
                if (isSex) specificDays.push('SEX');
                if (isSab) specificDays.push('SÁB');
                
                // Correção de Frequência
                if (specificDays.length === 2) frequency = '2x';
                else if (specificDays.length > 3) frequency = 'Diário';
            }
        } else {
            // FALLBACK IMPORTANTE
            targetGroups = [activeTab];
            specificDays = activeTab === 'SEG/QUA/SEX' ? ['SEG', 'QUA', 'SEX'] : ['TER', 'QUI', 'SÁB'];
        }

        // 2. INSERÇÃO INTELIGENTE
        const patientId = crypto.randomUUID();

        targetGroups.forEach(groupKey => {
            // Achar índice da cadeira
            const chairIndex = updatedData[groupKey].findIndex((c: any) => c.chairNumber === chairId);
            
            if (chairIndex !== -1) {
                // Definir Turno baseado no Horário
                let turnKey: 'turn1' | 'turn2' | 'turn3' = 'turn1';
                
                // Lógica de Turno REFINADA para acomodar 09:30 como 2º Turno
                // 1º Turno: < 09:00
                // 2º Turno: >= 09:00 e < 14:00
                // 3º Turno: >= 14:00
                if (startMinutes >= 840) turnKey = 'turn3';      // 14:00
                else if (startMinutes >= 540) turnKey = 'turn2'; // 09:00 (Ajuste para pegar 09:30)
                else turnKey = 'turn1';

                const existing = updatedData[groupKey][chairIndex][turnKey];
                let isUpdate = false;
                
                if (existing && normalizeString(existing.name).split(' ')[0] === normalizeString(name).split(' ')[0]) {
                    isUpdate = true;
                }

                // Filtrar dias específicos para este grupo
                const groupDaysFilter = groupKey === 'SEG/QUA/SEX' 
                    ? ['SEG', 'QUA', 'SEX'] 
                    : ['TER', 'QUI', 'SÁB'];
                
                const daysForThisGroup = specificDays.filter(d => groupDaysFilter.includes(d));

                // FORÇAR INSERÇÃO
                if (daysForThisGroup.length > 0 || frequency === 'Diário' || !colDays) {
                     updatedData[groupKey][chairIndex][turnKey] = {
                        id: isUpdate ? existing.id : patientId,
                        name: name,
                        treatment: treatment,
                        startTime: startTime,
                        duration: duration,
                        frequency: frequency,
                        specificDays: daysForThisGroup.length > 0 ? daysForThisGroup : groupDaysFilter,
                        checked: isUpdate ? existing.checked : false
                    };
                }
            } else {
                console.warn(`Poltrona ${chairId} não encontrada no sistema para ${name}.`);
            }
        });

        processedCount++;
      });

      if (processedCount > 0) {
          onImport(updatedData);
          setImportedCount(processedCount);
          setSuccessMsg(`Importação Concluída! ${processedCount} registros processados com sucesso.`);
          return true;
      }
      return false;

    } catch (e: any) {
        console.error(e);
        setError("Erro ao processar dados: " + e.message);
        return false;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);
    setImportedCount(0);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        
        const success = processDirectExcel(jsonData);

        if (!success && !error) { // Se falhou mas não setou erro específico
             setError("Não foi possível ler os dados. Verifique se a planilha segue o modelo.");
        }
        setIsProcessing(false);

      } catch (err) {
        setError("Arquivo corrompido ou formato inválido.");
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-appear">
        <div className="bg-slate-900 px-10 py-8 flex justify-between items-center text-white">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20"><FileSpreadsheet size={28}/></div>
            <div>
              <h3 className="text-xl font-black tracking-tight uppercase">Importar Planilha Mestra</h3>
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mt-1">Carregar dados do Modelo Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-10 space-y-8">
          
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-blue-800 text-xs font-medium leading-relaxed flex items-start gap-3">
              <CheckCircle2 size={20} className="shrink-0 mt-0.5 text-blue-600"/>
              <p>
                  <strong>Formato Ideal:</strong> Utilize o arquivo gerado pelo botão "Baixar Modelo" na aba Dados.
                  O sistema identificará automaticamente colunas como "NOME", "POLTRONA", "HORARIO" e "DIAS".
                  <br/><span className="text-[10px] opacity-70 mt-1 block">Suporta formatos de hora decimal (Excel) e texto (HH:MM).</span>
              </p>
          </div>

          <div className="w-full">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className={`w-full flex flex-col items-center justify-center gap-4 p-10 border-2 border-dashed rounded-[2rem] transition-all group ${
                  fileName 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                  : 'bg-slate-50 border-slate-300 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <div className={`p-4 rounded-2xl transition-all ${fileName ? 'bg-emerald-200 text-emerald-700 shadow-lg' : 'bg-white text-slate-400 shadow-sm group-hover:scale-110 group-hover:text-indigo-500'}`}>
                {isProcessing ? <Loader2 size={32} className="animate-spin text-indigo-600"/> : fileName ? <CheckCircle2 size={32} /> : <FileUp size={32} />}
              </div>
              <div className="text-center">
                <p className="text-sm font-black uppercase tracking-widest">
                    {isProcessing ? 'Processando...' : fileName ? 'Arquivo Lido com Sucesso' : 'Clique para selecionar a Planilha'}
                </p>
                <p className={`text-xs font-bold mt-1 ${fileName ? 'text-emerald-600' : 'opacity-60'}`}>
                    {fileName || 'Formatos: .xlsx ou .csv'}
                </p>
              </div>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 border border-rose-100 animate-appear">
              <span className="p-1 bg-white rounded-full shadow-sm shrink-0"><X size={12}/></span> 
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 border border-emerald-100 animate-appear">
              <span className="p-1 bg-white rounded-full shadow-sm shrink-0"><Sparkles size={12}/></span> 
              <span>{successMsg}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100">
            <button onClick={onClose} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20">
              {successMsg ? 'Concluir e Ver Grade' : 'Cancelar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
