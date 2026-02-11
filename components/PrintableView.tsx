
import React from 'react';
import { ScheduleData, DayGroup } from '../types';
import { getChairNumber } from '../constants';
import { Printer, CalendarDays, Clock3 } from 'lucide-react';

interface PrintableViewProps {
  data: ScheduleData;
  activeTab: DayGroup;
  dateLabel: string;
  weekDay: string;
}

export const PrintableView: React.FC<PrintableViewProps> = ({ data, activeTab, dateLabel, weekDay }) => {
  const chairs = [...data[activeTab]].sort((a, b) => getChairNumber(a.chairNumber) - getChairNumber(b.chairNumber));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white min-h-full p-4 animate-appear relative">
      <div className="fixed top-24 right-8 z-50 print:hidden">
         <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 font-black uppercase tracking-widest hover:scale-105 transition-all">
            <Printer size={20} /> Imprimir Mapa
         </button>
      </div>

      <div className="max-w-[297mm] mx-auto bg-white p-4">
        {/* Cabeçalho de Impressão Otimizado */}
        <div className="border-b-4 border-slate-900 pb-4 mb-4 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Mapa Diário de Sala</h1>
            <div className="flex items-center gap-6 mt-2">
                <div className="flex items-center gap-2 text-xl font-bold uppercase text-slate-700">
                    <CalendarDays size={24} strokeWidth={2.5}/> {activeTab}
                </div>
                <div className="h-6 w-0.5 bg-slate-300"></div>
                <div className="text-lg font-bold uppercase text-slate-500">
                    {weekDay}, {dateLabel}
                </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Legenda de Tratamento</div>
             <div className="flex gap-3 text-xs font-black uppercase">
                <span className="flex items-center gap-2 px-3 py-1 bg-white border-2 border-slate-900 rounded-md shadow-sm">
                    <span className="w-2 h-2 bg-slate-900 rounded-full"></span> HD (Convencional)
                </span>
                <span className="flex items-center gap-2 px-3 py-1 bg-slate-200 border-2 border-slate-400 rounded-md text-slate-600">
                    <span className="w-2 h-2 bg-slate-500 rounded-full"></span> HDF (Online)
                </span>
             </div>
          </div>
        </div>

        {/* Tabela de Alto Contraste */}
        <table className="w-full border-collapse border-2 border-slate-900 text-slate-900">
          <thead>
            <tr className="bg-slate-900 text-white print:bg-slate-900 print:text-white">
              <th className="border-2 border-slate-900 p-3 w-16 text-center font-black uppercase text-lg">Polt.</th>
              <th className="border-2 border-slate-900 p-3 w-[31%] text-center font-black uppercase text-sm tracking-widest bg-slate-800">1º Turno</th>
              <th className="border-2 border-slate-900 p-3 w-[31%] text-center font-black uppercase text-sm tracking-widest bg-slate-800">2º Turno</th>
              <th className="border-2 border-slate-900 p-3 w-[31%] text-center font-black uppercase text-sm tracking-widest bg-slate-800">3º Turno</th>
            </tr>
          </thead>
          <tbody>
            {chairs.map((chair, index) => (
              <tr key={chair.chairNumber} className={`break-inside-avoid ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                {/* Coluna Poltrona */}
                <td className="border-2 border-slate-900 p-2 text-center align-middle bg-slate-100">
                    <span className="text-2xl font-black block">{chair.chairNumber.replace('Leito', 'L.')}</span>
                </td>
                
                {/* Colunas dos Turnos */}
                {[chair.turn1, chair.turn2, chair.turn3].map((patient, idx) => (
                  <td key={idx} className={`border-2 border-slate-900 p-2 align-top h-20 ${patient?.treatment === 'HDF' ? 'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZjFmMhZjIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNjYmQ1ZTEiLz4KPC9zdmc+")]' : ''}`}>
                    {patient ? (
                      <div className="h-full flex flex-col justify-between relative">
                        {/* Marcador HDF Discreto no canto */}
                        {patient.treatment === 'HDF' && (
                            <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-slate-800 text-white text-[9px] font-black rounded-bl-lg">HDF</div>
                        )}
                        
                        {/* Nome do Paciente */}
                        <div className="pr-6">
                           <span className="text-[13px] font-extrabold uppercase leading-tight block text-slate-900">{patient.name}</span>
                        </div>

                        {/* Detalhes Inferiores */}
                        <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-300 border-dashed">
                           <div className="flex items-center gap-1.5">
                               <Clock3 size={14} className="text-slate-600" strokeWidth={3}/>
                               <span className="text-lg font-black font-mono tracking-tight">{patient.startTime}</span>
                           </div>
                           <div className="flex gap-2">
                               {patient.frequency !== '3x' && (
                                   <span className="text-[10px] font-black uppercase px-1.5 py-0.5 border border-slate-900 rounded bg-white">{patient.frequency}</span>
                               )}
                               <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-slate-200 border border-slate-400 rounded text-slate-700">{patient.duration.replace(':00', 'h')}</span>
                           </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-slate-200 font-black text-2xl select-none">/ / /</span>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="mt-6 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase print:fixed print:bottom-4 print:left-4 print:right-4 border-t border-slate-200 pt-2">
           <span>HemoScheduler Pro • Sistema de Gestão</span>
           <span>Impresso em: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};
