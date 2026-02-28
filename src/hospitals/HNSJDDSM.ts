import { HospitalConfig } from '../types/hospital';

export const HNSJDDSM: HospitalConfig = {
  id:           'HNSJDDSM',
  name:         'Hospital Nacional San Juan de Dios, San Miguel',
  abbreviation: 'HNSJDDSM',

  groups: [
    { key: 'sv',  label: 'Signos vitales', bg: '#DBEAFE', textColor: '#1D4ED8', cellBg: '#F0F9FF' },
    { key: 'ing', label: '💧 Ingresos',    bg: '#D1FAE5', textColor: '#065F46', cellBg: '#F0FDF4' },
    { key: 'egr', label: '🚽 Egresos',     bg: '#FEF3C7', textColor: '#92400E', cellBg: '#FFFBEB' },
  ],

  patientFields: {
    nombre:   'optional',
    edad:     'optional',
    registro: 'optional',
    talla:    'optional',
  },

  dataCols: [
    // ── Signos vitales ───────────────────────────────────────────────────────
    { key: 'ta',   label: 'T/A',     width: 72, isTA: true,      group: 'sv' },
    { key: 'pam',  label: 'PAM',     width: 48, readOnly: true,  group: 'sv' },
    { key: 'fc',   label: 'FC',      width: 46,                  group: 'sv' },
    { key: 'fr',   label: 'FR',      width: 46,                  group: 'sv' },
    { key: 'so2',  label: 'SO₂',     width: 46,                  group: 'sv' },
    { key: 'temp', label: 'T°',      width: 46,                  group: 'sv' },
    { key: 'hgt',  label: 'HGT',     width: 52,                  group: 'sv' },
    // ── Ingresos ─────────────────────────────────────────────────────────────
    { key: 'cristaloides',  label: 'Cristal.',  width: 64, group: 'ing' },
    { key: 'coloides',      label: 'Coloides',  width: 64, group: 'ing' },
    { key: 'norepinefrina', label: 'NE',        width: 50, group: 'ing' },
    { key: 'dobutamina',    label: 'Dobut.',    width: 50, group: 'ing' },
    { key: 'dopamina',      label: 'Dopam.',    width: 50, group: 'ing' },
    { key: 'vasopresina',   label: 'Vasop.',    width: 50, group: 'ing' },
    { key: 'ketamina',      label: 'Ketam.',    width: 50, group: 'ing' },
    { key: 'fentanilo',     label: 'Fent.',     width: 50, group: 'ing' },
    { key: 'remifentanilo', label: 'Remi.',     width: 50, group: 'ing' },
    { key: 'midazolam',     label: 'Midaz.',    width: 50, group: 'ing' },
    { key: 'cisatracurio',  label: 'Cisat.',    width: 50, group: 'ing' },
    { key: 'dextrosa',      label: 'Dextr.',    width: 50, group: 'ing' },
    { key: 'medicamentos',  label: 'Medic.',    width: 50, group: 'ing' },
    { key: 'enteral',       label: 'Enteral',   width: 54, group: 'ing' },
    { key: 'hemoderivados', label: 'Hemoder.',  width: 64, group: 'ing' },
    { key: 'otrosIngresos', label: 'Otros I',   width: 54, group: 'ing' },
    // ── Egresos ──────────────────────────────────────────────────────────────
    { key: 'orina',         label: 'Orina',     width: 54, group: 'egr' },
    { key: 'evacuaciones',  label: 'Evacua.',   width: 58, group: 'egr' },
    { key: 'aspiraciones',  label: 'Aspir.',    width: 54, group: 'egr' },
    { key: 'otrosEgresos',  label: 'Otros E',   width: 54, group: 'egr' },
  ],
};
