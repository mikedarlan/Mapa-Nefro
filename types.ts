
export type DayGroup = 'SEG/QUA/SEX' | 'TER/QUI/SÁB';
export type TreatmentType = 'HD' | 'HDF' | 'DP' | 'Conservador';
export type FrequencyType = '2x' | '3x' | 'Diário' | 'Extra';

export interface Patient {
  id: string;
  name: string;
  treatment: TreatmentType;
  startTime: string; // HH:mm format
  duration: string; // HH:mm format
  frequency: FrequencyType;
  specificDays?: string[]; // Array de dias específicos (ex: ['SEG', 'SEX'])
  checked?: boolean;
}

export interface ChairSchedule {
  chairNumber: string;
  turn1?: Patient | null;
  turn2?: Patient | null;
  turn3?: Patient | null;
}

export interface ScheduleData {
  'SEG/QUA/SEX': ChairSchedule[];
  'TER/QUI/SÁB': ChairSchedule[];
}

export interface FlatPatientRecord extends Patient {
  uniqueId: string;
  dayGroup: DayGroup;
  chairNumber: string;
  turn: 1 | 2 | 3;
}

// --- INTELLIGENCE TYPES ---

export interface KPI {
    label: string;
    value: string | number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    color: 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo' | 'violet' | 'cyan';
    subtext?: string;
}

export interface OptimizationSuggestion {
    id: string;
    type: 'MOVE' | 'COMPRESS' | 'SWAP';
    title: string;
    description: string;
    impact: string; // Ex: "Abre 1 vaga de 4h"
    urgency: 'ALTA' | 'MÉDIA' | 'BAIXA';
    // Dados para ação direta
    targetPatientName?: string;
    targetChair?: string;
    targetDayGroup?: DayGroup;
    suggestedTime?: string;
    currentTime?: string;
}

export interface GapOpportunity {
    dayGroup: DayGroup;
    chairNumber: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    canFitStandardSession: boolean; // Se cabe 4h + setup
}

export interface OperationalReport {
    occupancyRate: number; // %
    totalCapacity: number; // Total de slots possíveis
    activePatients: number;
    absorbableCapacity: number; // Quantos MAIS cabem
    vacanciesStandard: number; // Vagas de 4h disponíveis agora
    vacanciesPotential: number; // Vagas se otimizar a grade
    kpis: {
        efficiency: KPI;
        absorption: KPI;
        staffStress: KPI;
    };
    gaps: GapOpportunity[];
    aiSuggestions: OptimizationSuggestion[];
    executiveSummary: string;
}
