import { HospitalConfig } from '../types/hospital';

export const HNSJDDSM: HospitalConfig = {
  id:           'HNSJDDSM',
  name:         'Hospital Nacional San Juan de Dios, San Miguel',
  abbreviation: 'HNSJDDSM',

  groups: [
    { key: 'sv',  label: 'Signos vitales', bg: '#E2ECF8', textColor: '#2A4A80', cellBg: '#F5F8FD' },
    { key: 'ing', label: 'Ingresos',       bg: '#DDF0E5', textColor: '#1C5F3D', cellBg: '#F2F9F5' },
    { key: 'egr', label: 'Egresos',        bg: '#EDE8D8', textColor: '#7A5020', cellBg: '#F8F5EC' },
  ],

  cardPreview: ['registro', 'edad', 'peso', 'sc'],

  patientFields: {
    nombre:   'optional',
    edad:     'optional',
    registro: 'optional',
    talla:    'optional',
  },

  dataCols: [
    // ── Signos vitales ───────────────────────────────────────────────────────
    { key: 'ta',   label: 'T/A',   width: 72, isTA: true,     group: 'sv' },
    { key: 'pam',  label: 'PAM',   width: 48, readOnly: true, group: 'sv' },
    { key: 'fc',   label: 'FC',    width: 46,                 group: 'sv' },
    { key: 'fr',   label: 'FR',    width: 46,                 group: 'sv' },
    { key: 'so2',  label: 'SO₂',   width: 46,                 group: 'sv' },
    { key: 'temp', label: 'T°',    width: 46,                 group: 'sv' },
    { key: 'hgt',  label: 'HGT',   width: 52,                 group: 'sv' },

    // ── Ingresos ─────────────────────────────────────────────────────────────
    { key: 'cristaloides',  label: 'Cristal.',   width: 60, group: 'ing' },
    { key: 'coloides',      label: 'Coloides',   width: 58, group: 'ing' },
    { key: 'dopamina',      label: 'Dopam.',     width: 52, group: 'ing' },
    { key: 'dobutamina',    label: 'Dobut.',     width: 52, group: 'ing' },
    {
      key: 'norepinefrina', label: 'NE',         width: 50, group: 'ing',
      alternates: [
        { key: 'vasopresina', label: 'Vasop.', width: 50, group: 'ing' },
      ],
    },
    {
      key: 'sedantes',      label: 'Sedantes',   width: 62, group: 'ing',
      alternates: [
        { key: 'ketamina',      label: 'Ketam.',  width: 62, group: 'ing' },
        { key: 'fentanilo',     label: 'Fent.',   width: 62, group: 'ing' },
        { key: 'remifentanilo', label: 'Remi.',   width: 62, group: 'ing' },
        { key: 'midazolam',     label: 'Midaz.',  width: 62, group: 'ing' },
        { key: 'cisatracurio',  label: 'Cisat.',  width: 62, group: 'ing' },
      ],
    },
    {
      key: 'medicamentos',  label: 'Medic.',     width: 56, group: 'ing',
      alternates: [
        { key: 'dextrosa',      label: 'Dextr.',  width: 56, group: 'ing' },
        { key: 'otrosIngresos', label: 'Otros I', width: 56, group: 'ing' },
      ],
    },
    { key: 'insulina',      label: 'Insulina',   width: 56, group: 'ing' },
    { key: 'enteral',       label: 'V. Enteral', width: 62, group: 'ing' },
    { key: 'hemoderivados', label: 'Hemoder.',   width: 62, group: 'ing' },
    { key: 'total_ing',     label: 'Total',      width: 62, group: 'ing', isTotal: true, readOnly: true },

    // ── Egresos ──────────────────────────────────────────────────────────────
    { key: 'orina',        label: 'Orina',    width: 54, group: 'egr' },
    {
      key: 'evacuaciones', label: 'Evacua.',  width: 58, group: 'egr',
      alternates: [
        { key: 'aspiraciones', label: 'Aspir.', width: 58, group: 'egr' },
      ],
    },
    { key: 'drenos',       label: 'Drenos',   width: 54, group: 'egr' },
    { key: 'otrosEgresos', label: 'Otros',    width: 54, group: 'egr' },
    { key: 'total_egr',    label: 'Total',    width: 58, group: 'egr', isTotal: true, readOnly: true },
  ],
};
