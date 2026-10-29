import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { LauncherApi } from '@shared/types'

// Мост между окном и main-процессом: окно видит только эти функции, без доступа к Node.

const api: LauncherApi = {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: (input) => ipcRenderer.invoke('projects:add', input),
  addProjects: (inputs) => ipcRenderer.invoke('projects:addMany', inputs),
  updateProject: (id, input) => ipcRenderer.invoke('projects:update', id, input),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  setNotes: (id, notes) => ipcRenderer.invoke('projects:notes', id, notes),

  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  pickImage: () => ipcRenderer.invoke('dialog:image'),
  detect: (folder) => ipcRenderer.invoke('detect', folder),
  scanRoots: (roots) => ipcRenderer.invoke('scan:roots', roots),
  gitState: (id) => ipcRenderer.invoke('git:state', id),
  gitStates: () => ipcRenderer.invoke('git:states'),

  openInIde: (id, ide) => ipcRenderer.invoke('open:ide', id, ide),
  openFolder: (id) => ipcRenderer.invoke('open:folder', id),
  openTerminal: (id) => ipcRenderer.invoke('open:terminal', id),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  showContextMenu: (id) => ipcRenderer.invoke('menu:context', id),

  repoActivity: (id) => ipcRenderer.invoke('repo:activity', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  testForge: (host) => ipcRenderer.invoke('settings:test', host),
  pickExe: () => ipcRenderer.invoke('dialog:exe'),

  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
