import { defineImage } from '../src/platform/image-schema';

export default defineImage({
  // ── System packages (apt-get install) ──
  apt: [
    'git',
    'python3',
    'python3-venv',
    'python3-pip',
    'curl',
    'vim',
  ],

  // ── Global npm tools (npm install -g) ──
  npm: [],

  // ── Python packages (pip install inside /opt/pyenv) ──
  pip: [
    'pandas==2.2.3',
    'openpyxl==3.1.5',
    'XlsxWriter==3.2.0',
    'python-dateutil==2.9.0.post0',
    'python-docx==1.1.2',
    'python-pptx==1.0.2',
    'pypdf==5.1.0',
    'pdfplumber==0.11.4',
    'numpy==2.1.2',
    'rapidfuzz==3.10.1',
    'beautifulsoup4==4.12.3',
    'lxml==5.3.0',
  ],

  // ── Custom setup script (runs last during docker build) ──
  setup: '',
});
