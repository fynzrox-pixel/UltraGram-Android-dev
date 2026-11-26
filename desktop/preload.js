const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('ultragram', { platform: 'desktop' });
