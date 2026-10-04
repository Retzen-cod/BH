import { HospitalConfig } from '../../types/hospital';
import { GENERAL } from './general';
import { MANTENIMIENTO } from './mantenimiento';

// Para agregar una tabla: crear ./NOMBRE.ts con su TableConfig y añadirla a `tables`.
export const HNSJDDSM: HospitalConfig = {
  id:           'HNSJDDSM',
  name:         'Hospital Nacional San Juan de Dios, San Miguel',
  abbreviation: 'HNSJDDSM',
  tables: [
    GENERAL,        // primera = por defecto (pacientes sin tableId)
    MANTENIMIENTO,
  ],
};
