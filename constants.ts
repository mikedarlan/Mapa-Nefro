
import { ScheduleData, DayGroup, Patient, FlatPatientRecord, TreatmentType, FrequencyType } from './types';

export const OPERATING_HOURS_START = 5.5; 
export const OPERATING_HOURS_END = 21.0;   
export const SLOT_INTERVAL = 30;          
export const SETUP_DURATION_MINUTES = 90; // 1:30h

// === SISTEMA DE BANCO DE DADOS LOCAL (HemoDB) ===
// Chave ESTÁVEL e DEFINITIVA para produção
const DB_PREFIX = 'HEMO_PRO_STABLE_V1'; 

const KEYS = {
  MASTER: `${DB_PREFIX}_MASTER`,       // Fonte da verdade principal
  MIRROR: `${DB_PREFIX}_MIRROR`,       // Cópia de segurança imediata (Redundância)
  SHADOW: `${DB_PREFIX}_SHADOW`,       // Snapshot temporal (Backup de segurança contra corrupção)
  META: `${DB_PREFIX}_METADATA`        // Metadados do banco (versão, timestamp)
};

// Chaves legadas para migração automática (Incluindo a versão V9_CLEAN anterior)
const LEGACY_KEYS = [
  'HEMOSCHEDULER_DB_V9_CLEAN_MASTER', // Versão anterior imediata
  'HEMOSCHEDULER_DB_V7_PRODUCTION_MASTER',
  'HEMOSCHEDULER_DB_V6_PRODUCTION_MASTER',
  'HEMOSCHEDULER_DB_V5_PRODUCTION_MASTER',
  'HEMOSCHEDULER_DB_V4_PRODUCTION_MASTER',
  'HEMOSCHEDULER_DB_V3_PRODUCTION_MASTER',
  'HEMOSCHEDULER_DB_V2_MASTER',
  'HEMO_DB_PERMANENT_V1_MASTER_DATA'
];

export const allChairs = ["01","02","03","04","05","06","07","08","Leito 09","10","11","12","13","14","15","16","17","18","19","20"];

// === SEED DATA (VAZIO PARA IMPORTAÇÃO) ===
const SEED_RAW_DATA = ``;

// --- HELPER FUNCTIONS ---

export const timeToMinutes = (time: string): number => {
  if (!time || typeof time !== 'string') return 0;
  const cleanTime = time.toLowerCase().trim().replace(/[h\.,]/g, ':');
  const parts = cleanTime.split(':');
  if (parts.length === 0) return 0;
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

export const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const parseDurationMinutes = (timeStr: string): number => {
  return timeToMinutes(timeStr);
};

export const getChairNumber = (id: string): number => {
  if (!id) return 999;
  if (id.toLowerCase().includes('leito')) {
      const match = id.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 9;
      return num;
  }
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
};

export const snapToGrid = (minutes: number): number => {
  return Math.floor(minutes / SLOT_INTERVAL) * SLOT_INTERVAL;
};

export const cleanAIJsonResponse = (text: string | undefined): string => {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const normalizeString = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "") 
    .toUpperCase()
    .trim();
};

// --- DATA MANAGEMENT ---

export const createEmptySchedule = (): ScheduleData => {
    return {
        'SEG/QUA/SEX': allChairs.map(c => ({ chairNumber: c, turn1: null, turn2: null, turn3: null })),
        'TER/QUI/SÁB': allChairs.map(c => ({ chairNumber: c, turn1: null, turn2: null, turn3: null }))
    };
};

export const INITIAL_DATA: ScheduleData = createEmptySchedule();

const hydratePatientData = (p: any, defaultGroup: DayGroup): Patient => {
    if (!p.specificDays || !Array.isArray(p.specificDays) || p.specificDays.length === 0) {
        if (defaultGroup === 'SEG/QUA/SEX') p.specificDays = ['SEG', 'QUA', 'SEX'];
        else p.specificDays = ['TER', 'QUI', 'SÁB'];
    }
    return p as Patient;
};

export const normalizeData = (data: any): ScheduleData => {
  if (!data) return INITIAL_DATA;
  
  try {
    const clean = JSON.parse(JSON.stringify(data));
    
    // Reconstrói a grade baseada em allChairs para garantir integridade (remove cadeiras extras, adiciona faltantes)
    const normalized = createEmptySchedule();

    ['SEG/QUA/SEX', 'TER/QUI/SÁB'].forEach((g) => {
        const groupKey = g as DayGroup;
        
        // Se a chave não existir no dado de entrada, pule
        if (!clean[groupKey]) return;

        // Itera sobre as poltronas OFICIAIS
        normalized[groupKey] = normalized[groupKey].map(officialChair => {
            // Tenta encontrar a poltrona correspondente nos dados salvos
            const foundChair = clean[groupKey].find((c: any) => c.chairNumber === officialChair.chairNumber);
            
            if (foundChair) {
                return {
                    chairNumber: officialChair.chairNumber,
                    turn1: foundChair.turn1 ? hydratePatientData(foundChair.turn1, groupKey) : null,
                    turn2: foundChair.turn2 ? hydratePatientData(foundChair.turn2, groupKey) : null,
                    turn3: foundChair.turn3 ? hydratePatientData(foundChair.turn3, groupKey) : null,
                };
            }
            return officialChair;
        });
    });

    return normalized;
  } catch (e) {
    console.error("[HemoDB] Erro de integridade:", e);
    return INITIAL_DATA;
  }
};

export const getStats = (data: ScheduleData) => {
  let totalSlots = 0;
  const uniqueNames = new Set<string>();
  let hdfCount = 0;
  let hdCount = 0;
  
  // Contadores por turno
  let turn1Count = 0;
  let turn2Count = 0;
  let turn3Count = 0;

  ['SEG/QUA/SEX', 'TER/QUI/SÁB'].forEach(g => {
    data[g as DayGroup].forEach(c => {
        // Turno 1
        if (c.turn1) {
            totalSlots++;
            uniqueNames.add(normalizeString(c.turn1.name));
            turn1Count++;
            if (c.turn1.treatment === 'HDF') hdfCount++; else hdCount++;
        }
        // Turno 2
        if (c.turn2) {
            totalSlots++;
            uniqueNames.add(normalizeString(c.turn2.name));
            turn2Count++;
            if (c.turn2.treatment === 'HDF') hdfCount++; else hdCount++;
        }
        // Turno 3
        if (c.turn3) {
            totalSlots++;
            uniqueNames.add(normalizeString(c.turn3.name));
            turn3Count++;
            if (c.turn3.treatment === 'HDF') hdfCount++; else hdCount++;
        }
    });
  });
  
  return {
    totalSlots,
    uniquePatients: uniqueNames.size,
    hdCount,
    hdfCount,
    hdfPercent: totalSlots > 0 ? Math.round((hdfCount / totalSlots) * 100) : 0,
    hdPercent: totalSlots > 0 ? Math.round((hdCount / totalSlots) * 100) : 0,
    turnStats: {
        t1: turn1Count,
        t2: turn2Count,
        t3: turn3Count
    }
  };
};

const countRecords = (data: ScheduleData): number => {
  return getStats(data).totalSlots;
};

// --- CAMADA DE BANCO DE DADOS (HemoDB Core) ---

export const initializeDataStore = (): { data: ScheduleData, source: string, restored: boolean } => {
  console.log("[HemoDB] Iniciando conexão com banco de dados...");
  
  // 1. Tenta carregar MASTER (Versão Atual)
  const rawMaster = localStorage.getItem(KEYS.MASTER);
  if (rawMaster) {
    try {
      const masterData = JSON.parse(rawMaster);
      // Validação básica: se tem as chaves principais
      if (masterData && (masterData['SEG/QUA/SEX'] || masterData['TER/QUI/SÁB'])) {
         const count = countRecords(masterData);
         console.log(`[HemoDB] MASTER carregado com sucesso. Registros: ${count}`);
         return { data: normalizeData(masterData), source: 'MASTER', restored: false };
      }
    } catch (e) {
        console.error("[HemoDB] Erro no MASTER. Tentando Recuperação...", e);
    }
  }

  // 2. Falha no Master? Tenta carregar MIRROR (Redundância Imediata)
  const rawMirror = localStorage.getItem(KEYS.MIRROR);
  if (rawMirror) {
      try {
          const mirrorData = JSON.parse(rawMirror);
          console.warn("[HemoDB] Recuperado via MIRROR.");
          // Auto-Repair Master
          localStorage.setItem(KEYS.MASTER, rawMirror);
          return { data: normalizeData(mirrorData), source: 'MIRROR', restored: true };
      } catch(e) {}
  }

  // 3. MIGRAÇÃO AUTOMÁTICA (Procura versões anteriores se o atual estiver vazio)
  // Isso impede perda de dados quando o sistema é atualizado e a chave do DB muda
  for (const legacyKey of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
          try {
              const legacyData = JSON.parse(legacyRaw);
              const legacyCount = countRecords(legacyData);
              if (legacyCount > 0) {
                  console.log(`[HemoDB] Migrando dados da versão antiga (${legacyKey})...`);
                  const normalized = normalizeData(legacyData);
                  // Salva imediatamente na nova estrutura para persistir a migração
                  localStorage.setItem(KEYS.MASTER, JSON.stringify(normalized));
                  localStorage.setItem(KEYS.MIRROR, JSON.stringify(normalized));
                  return { data: normalized, source: 'LEGACY_MIGRATION', restored: true };
              }
          } catch(e) {
              console.warn(`[HemoDB] Falha ao migrar chave legada ${legacyKey}`);
          }
      }
  }

  // 4. Se não achou nada, retorna o INITIAL_DATA (Vazio)
  console.log("[HemoDB] Banco novo. Carregando dados padrão (Vazio).");
  return { data: INITIAL_DATA, source: 'EMPTY', restored: false };
};

export const saveDataSecurely = (newData: ScheduleData, allowEmpty: boolean = false): { success: boolean, error?: string } => {
  try {
    const newJson = JSON.stringify(newData);
    const newCount = countRecords(newData);
    
    // === PROTEÇÃO DE INTEGRIDADE (ANTI-WIPE RIGOROSO) ===
    const currentStored = localStorage.getItem(KEYS.MASTER);
    if (currentStored && !allowEmpty) {
        try {
            const currentData = JSON.parse(currentStored);
            const currentCount = countRecords(currentData);
            
            // ALTERAÇÃO CRÍTICA: Se existir PELO MENOS 1 registro, e estiver tentando salvar 0, BLOQUEIA.
            // Antes era > 5, agora é > 0 para garantir que testes ou poucos dados não sejam perdidos.
            if (currentCount > 0 && newCount === 0) {
                const msg = `[HemoDB] PROTEÇÃO ATIVADA: Tentativa de sobrescrever ${currentCount} registros com base vazia bloqueada.`;
                console.error(msg);
                return { success: false, error: "Proteção de Dados Ativada: O banco contém dados e não pode ser zerado automaticamente." };
            }
        } catch(e) {
            // Se o JSON atual estiver corrompido, permite salvar por cima (auto-fix)
            console.warn("JSON atual corrompido, permitindo sobrescrita.");
        }
    }

    // 1. Commit no MASTER
    localStorage.setItem(KEYS.MASTER, newJson);
    
    // 2. Commit no MIRROR (Sempre que salvar com sucesso)
    localStorage.setItem(KEYS.MIRROR, newJson);
    
    // 3. Commit no SHADOW (TRIPLA REDUNDÂNCIA)
    // O Shadow é um backup que tentamos não sobrescrever com zero, mas aqui simplificamos para manter sincronia
    if (newCount > 0) {
        localStorage.setItem(KEYS.SHADOW, newJson);
    }

    // 4. Metadados
    localStorage.setItem(KEYS.META, JSON.stringify({ 
        lastSaved: new Date().toISOString(), 
        recordCount: newCount,
        version: '10.0'
    }));
    
    return { success: true };
  } catch (e: any) {
    console.error("[HemoDB] Falha crítica ao salvar:", e);
    return { success: false, error: e.message };
  }
};

export const downloadDatabase = (data: ScheduleData) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    
    link.href = url;
    link.download = `HEMO_BACKUP_${date}_${time}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const wipeAllData = (): ScheduleData => {
  const empty = createEmptySchedule(); 
  const emptyJson = JSON.stringify(empty);
  
  // Limpa chaves principais
  localStorage.setItem(KEYS.MASTER, emptyJson);
  localStorage.setItem(KEYS.MIRROR, emptyJson);
  localStorage.removeItem(KEYS.SHADOW); 
  
  // Não removemos as LEGACY_KEYS aqui para permitir rollback manual se necessário,
  // mas o sistema vai priorizar o MASTER vazio agora.
  
  return empty;
};

export const flattenSchedule = (data: ScheduleData): FlatPatientRecord[] => {
  const result: FlatPatientRecord[] = [];
  ['SEG/QUA/SEX', 'TER/QUI/SÁB'].forEach(group => {
    data[group as DayGroup].forEach(chair => {
      [1, 2, 3].forEach(turnNum => {
        const patient = (chair as any)[`turn${turnNum}`] as Patient | null;
        if (patient) {
          result.push({
            ...patient,
            uniqueId: `${patient.id}_${group}_${chair.chairNumber}_${turnNum}`,
            dayGroup: group as DayGroup,
            chairNumber: chair.chairNumber,
            turn: turnNum as 1 | 2 | 3,
          });
        }
      });
    });
  });
  return result;
};

export const rebuildSchedule = (records: FlatPatientRecord[]): ScheduleData => {
  const data: ScheduleData = createEmptySchedule(); 

  records.forEach(rec => {
    const chair = data[rec.dayGroup].find(c => c.chairNumber === rec.chairNumber);
    if (chair) {
      (chair as any)[`turn${rec.turn}`] = {
        id: rec.id,
        name: rec.name,
        treatment: rec.treatment,
        startTime: rec.startTime,
        duration: rec.duration,
        frequency: rec.frequency,
        specificDays: rec.specificDays, 
        checked: rec.checked
      };
    }
  });
  return data;
};
