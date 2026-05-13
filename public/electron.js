// public/electron.js
// Main process for Food Printing Quality Calculator (updated to remove duplicate handlers)

try {
  if (typeof globalThis !== 'undefined' && !globalThis.translations) {
    globalThis.translations = {};
  }
} catch (err) {
  console.warn('Could not set global translations placeholder', err && err.message);
}

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');

let mainWindow;

const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'quality-calculator-data.json');

function buildMenu(lang = 'pt') {
  const menutrans = {
    pt: {
      file: 'Arquivo',
      new: 'Novo',
      exportPdf: 'Exportar PDF',
      quit: 'Sair',
      edit: 'Editar',
      undo: 'Desfazer',
      redo: 'Refazer',
      cut: 'Recortar',
      copy: 'Copiar',
      paste: 'Colar',
      resetForm: 'Zerar Formulário',
      view: 'Visualizar',
      reload: 'Recarregar',
      toggleDevTools: 'Ferramentas de Desenvolvimento',
      toggleFullScreen: 'Tela Cheia',
      help: 'Ajuda',
      about: 'Sobre',
      howTo: 'Como Usar',
      shortcuts: 'Atalhos de Teclado'
    },
    en: {
      file: 'File',
      new: 'New',
      exportPdf: 'Export PDF',
      quit: 'Quit',
      edit: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      resetForm: 'Reset Form',
      view: 'View',
      reload: 'Reload',
      toggleDevTools: 'Toggle DevTools',
      toggleFullScreen: 'Toggle Full Screen',
      help: 'Help',
      about: 'About',
      howTo: 'How to use',
      shortcuts: 'Keyboard Shortcuts'
    }
  };

  const t = menutrans[lang] || menutrans.pt;

  const template = [
    {
      label: t.file,
      submenu: [
        {
          label: t.new,
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow && mainWindow.webContents.send('new-calculation')
        },
        { type: 'separator' },
        {
          label: t.exportPdf,
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow && mainWindow.webContents.send('export-pdf')
        },
        { type: 'separator' },
        { role: 'quit', label: t.quit }
      ]
    },
    {
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { type: 'separator' },
        {
          label: t.resetForm,
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.webContents.send('reset-form')
        }
      ]
    },
    {
      label: t.view,
      submenu: [
        { role: 'reload', label: t.reload },
        { role: 'toggledevtools', label: t.toggleDevTools },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.toggleFullScreen }
      ]
    },
    {
      label: t.help,
      submenu: [
        {
          label: t.about,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: t.about,
              message: '3D Food Printing Quality Calculator',
              detail: [
                'Version 3.0.0',
                'Authors: LOPES, L.C.; COSTA, J.A.V.; ROSA, G.M.',
                'Institution: FURG',
                'Registered under Brazilian Law 9.609/1998',
                '',
                '© 2025 — 3DFPQ'
              ].join('\n'),
              buttons: ['OK']
            });
          }
        },
        {
          label: t.howTo,
          click: () => {
            dialog.showMessageBox(mainWindow, {
            title: t.howTo,
            message: t.howTo,
            detail: lang === 'pt'
              ? [
                  '1. AVALIAÇÃO',
                  '   • Preencha as informações da amostra',
                  '   • Insira a Precisão de Impressão (%) para calcular automaticamente a Fidelidade Dimensional',
                  '   • Avalie os 5 parâmetros qualitativos (1–5) durante e após a impressão',
                  '   • Clique em "Salvar Resultado" para registrar',
                  '',
                  '2. GUIA DE PONTUAÇÃO',
                  '   • Consulte as tabelas de conversão e critérios visuais para cada parâmetro',
                  '',
                  '3. HISTÓRICO',
                  '   • Visualize o gráfico de pontuações',
                  '   • Selecione amostras para exportar CSV ou PDF',
                  '   • Clique em uma linha para ver o detalhe completo'
                ].join('\n')
              : [
                  '1. EVALUATION',
                  '   • Fill in the sample information',
                  '   • Enter Print Precision (%) to auto-calculate Dimensional Fidelity score',
                  '   • Score the 5 qualitative parameters (1–5) during and after printing',
                  '   • Click "Save Result" to record the evaluation',
                  '',
                  '2. SCORING GUIDE',
                  '   • Consult conversion tables and visual criteria for each parameter',
                  '',
                  '3. HISTORY',
                  '   • View the score chart',
                  '   • Select samples to export CSV or PDF',
                  '   • Click a row to see full detail'
                ].join('\n'),
            buttons: ['OK']
            });
          }
        },
        {
          label: t.shortcuts,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: t.shortcuts,
              detail: lang === 'pt'
                ? [
                    'Ctrl+N   →  Nova avaliação (limpa os scores)',
                    'Ctrl+E   →  Exportar PDF',
                    'Ctrl+S   →  Salvar resultado',
                    'F11      →  Tela cheia',
                    'F12      →  Ferramentas de desenvolvimento'
                  ].join('\n')
                : [
                    'Ctrl+N   →  New evaluation (clears scores)',
                    'Ctrl+E   →  Export PDF',
                    'Ctrl+S   →  Save result',
                    'F11      →  Full screen',
                    'F12      →  Developer tools'
                  ].join('\n'),
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow() {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1800,            // aumentou para 1500px
    height: 900,
    useContentSize: true,   // considera o tamanho do conteúdo em vez do frame externo
    minWidth: 1100,         // evita ficar menor que um limite aceitável
    minHeight: 700,
    resizable: true,
    title: "Food Printing Quality Calculator",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  let lang = 'pt';
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const stored = JSON.parse(raw || "{}");
      if (stored.language) lang = stored.language;
    }
  } catch (err) {
    console.warn('Could not read language preference:', err);
  }

  const menu = buildMenu(lang);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => (mainWindow = null));

  setupIpcHandlers();
}

function setupIpcHandlers() {
  ipcMain.handle('save-data', async (_, data) => {
    try {
      await fs.promises.writeFile(dataFilePath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (err) {
      console.error('save-data:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-data', async () => {
    try {
      if (fs.existsSync(dataFilePath)) {
        const raw = await fs.promises.readFile(dataFilePath, 'utf8');
        return JSON.parse(raw);
      }
      return { history: [], language: 'pt', weights: {} };
    } catch (err) {
      console.error('load-data:', err);
      return { history: [], language: 'pt', weights: {} };
    }
  });

  ipcMain.handle('save-language', async (_, lang) => {
    try {
      let data = { history: [], language: lang, weights: {} };
      if (fs.existsSync(dataFilePath)) {
        data = JSON.parse(await fs.promises.readFile(dataFilePath, 'utf8'));
        data.language = lang;
      } else {
        data.language = lang;
      }
      await fs.promises.writeFile(dataFilePath, JSON.stringify(data, null, 2));
      const menu = buildMenu(lang);
      Menu.setApplicationMenu(menu);
      return { success: true };
    } catch (err) {
      console.error('save-language:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-file', async (_, { filename, content }) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save file',
        defaultPath: path.join(app.getPath('documents'), filename)
      });
      if (canceled || !filePath) return { success: false };
      await fs.promises.writeFile(filePath, content);
      return { success: true, path: filePath };
    } catch (err) {
      console.error('save-file:', err);
      return { success: false, error: err.message };
    }
  });

  // Salva binário em app.getPath('userData') e retorna caminho (único handler)
  ipcMain.handle('save-binary-to-userdata', async (_, { filename, content }) => {
    try {
      const userData = app.getPath('userData');
      const safeName = path.basename(filename || 'file.bin');
      const fullPath = path.join(userData, safeName);
      const buf = Buffer.from(content);
      await fs.promises.writeFile(fullPath, buf);
      return { success: true, path: fullPath };
    } catch (err) {
      console.error('save-binary-to-userdata:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-pdf', async (_, data) => {
    try {
      const isMulti = Array.isArray(data.selectedEntries);
      const defaultName = isMulti ? 'relatorio-multiplas-amostras.pdf' : `relatorio-${data.sampleInfo?.sampleCode || 'amostra'}.pdf`;

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Export PDF',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (canceled || !filePath) return { success: false };

      const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js')
        }
      });

      const printUrl = isDev
        ? 'http://localhost:3000/print-template.html'
        : `file://${path.join(__dirname, '../build/print-template.html')}`;

      await printWin.loadURL(printUrl);
      printWin.webContents.send('prepare-print-view', data);

      await new Promise(resolve => {
        const timeout = setTimeout(() => { resolve(); }, 4000);
        ipcMain.once('print-window-ready', () => { clearTimeout(timeout); resolve(); });
      });

      await new Promise(r => setTimeout(r, 500));

      const pdfOptions = { marginsType: 0, printBackground: true, pageSize: 'A4' };
      const pdfData = await printWin.webContents.printToPDF(pdfOptions);
      await fs.promises.writeFile(filePath, pdfData);
      printWin.close();

      return { success: true, path: filePath };
    } catch (err) {
      console.error('export-pdf:', err);
      return { success: false, error: err.message };
    }
  });

  // open-path: abre o arquivo com o app padrão do SO
  ipcMain.handle('open-path', async (_, filePath) => {
    try {
      if (!filePath) return { success: false, error: 'No path provided' };
      const res = await shell.openPath(filePath);
      if (typeof res === 'string' && res.length > 0) {
        return { success: false, error: res };
      }
      return { success: true };
    } catch (err) {
      console.error('open-path:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // cleanup-unused-photos
  ipcMain.handle('cleanup-unused-photos', async () => {
    try {
      const userData = app.getPath('userData');
      let stored = { history: [] };
      if (fs.existsSync(dataFilePath)) {
        const raw = await fs.promises.readFile(dataFilePath, 'utf8');
        stored = JSON.parse(raw || "{}");
      }
      const referenced = new Set();
      (stored.history || []).forEach((h) => {
        if (h.photoPath) referenced.add(path.resolve(h.photoPath));
        if (h.photoThumbPath) referenced.add(path.resolve(h.photoThumbPath));
      });

      const files = await fs.promises.readdir(userData);
      const candidateExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const candidates = files.filter((f) => candidateExt.includes(path.extname(f).toLowerCase()));

      const removed = [];
      for (const f of candidates) {
        const full = path.join(userData, f);
        const resolved = path.resolve(full);
        if (!referenced.has(resolved)) {
          if (f.toLowerCase().includes('impressao') || f.toLowerCase().includes('-thumb')) {
            try {
              await fs.promises.unlink(full);
              removed.push(full);
            } catch (err) {
              console.warn('Failed to delete', full, err);
            }
          }
        }
      }

      return { success: true, removed, checked: candidates.length };
    } catch (err) {
      console.error('cleanup-unused-photos:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.on('ready-to-print', () => {});
  ipcMain.on('print-window-ready', () => {});
}

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });
