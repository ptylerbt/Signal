const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('signal', {
  previewImport: () => ipcRenderer.invoke('roster:previewImport'),
  confirmImport: (rows) => ipcRenderer.invoke('roster:confirmImport', { rows }),
  listTeachers: () => ipcRenderer.invoke('roster:listTeachers'),
  listDuplicates: () => ipcRenderer.invoke('roster:listDuplicates'),
  mergeTeachers: (keepId, mergeIds) =>
    ipcRenderer.invoke('roster:mergeTeachers', { keepId, mergeIds }),
  setDistrictRep: (teacherId, isRep) =>
    ipcRenderer.invoke('roster:setDistrictRep', { teacherId, isRep }),
  dedupeTeacherAssignments: (teacherId) =>
    ipcRenderer.invoke('roster:dedupeTeacherAssignments', { teacherId }),
  dedupeAllAssignments: () => ipcRenderer.invoke('roster:dedupeAllAssignments'),
  combineByEmail: (teacherId) => ipcRenderer.invoke('roster:combineByEmail', { teacherId }),
  searchTeachers: (query) => ipcRenderer.invoke('roster:searchTeachers', { query }),
  getTeacher: (teacherId) => ipcRenderer.invoke('roster:getTeacher', { teacherId }),
  updateTeacherName: (teacherId, firstName, lastName) =>
    ipcRenderer.invoke('roster:updateTeacherName', { teacherId, firstName, lastName }),
  updateAssignment: (assignmentId, fields) =>
    ipcRenderer.invoke('roster:updateAssignment', { assignmentId, fields }),
  addAssignment: (teacherId, fields) =>
    ipcRenderer.invoke('roster:addAssignment', { teacherId, fields }),
  deleteAssignment: (assignmentId) =>
    ipcRenderer.invoke('roster:deleteAssignment', { assignmentId }),
  getStats: () => ipcRenderer.invoke('roster:getStats'),
  downloadRosterTemplate: () => ipcRenderer.invoke('roster:downloadTemplate'),
  setDefaultAssignment: (teacherId, assignmentId) =>
    ipcRenderer.invoke('roster:setDefaultAssignment', { teacherId, assignmentId }),

  uploadTemplate: () => ipcRenderer.invoke('templates:upload'),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  getLabelMaps: (templateId) => ipcRenderer.invoke('templates:getLabelMaps', { templateId }),
  setLabelMap: (labelMapId, matchedColumn) =>
    ipcRenderer.invoke('templates:setLabelMap', { labelMapId, matchedColumn }),
  generatePreview: (templateId, assignmentIds) =>
    ipcRenderer.invoke('templates:generatePreview', { templateId, assignmentIds }),

  listFilterOptions: () => ipcRenderer.invoke('groups:listFilterOptions'),
  filterAssignments: (filters) => ipcRenderer.invoke('groups:filterAssignments', filters),
  createGroup: (name, assignmentIds) =>
    ipcRenderer.invoke('groups:create', { name, assignmentIds }),
  listGroups: () => ipcRenderer.invoke('groups:list'),
  getGroupMembers: (groupId) => ipcRenderer.invoke('groups:getMembers', { groupId }),
  deleteGroup: (groupId) => ipcRenderer.invoke('groups:delete', { groupId }),

  openMailto: (url, sendRecords) => ipcRenderer.invoke('mail:openMailto', { url, sendRecords }),

  listSendsForTeacher: (teacherId) =>
    ipcRenderer.invoke('sends:listForTeacher', { teacherId }),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  createProject: (name, description) => ipcRenderer.invoke('projects:create', { name, description }),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  getProject: (projectId) => ipcRenderer.invoke('projects:get', { projectId }),
  addProjectPerson: (projectId, teacherId) =>
    ipcRenderer.invoke('projects:addPerson', { projectId, teacherId }),
  removeProjectPerson: (projectId, teacherId) =>
    ipcRenderer.invoke('projects:removePerson', { projectId, teacherId }),
  addProjectNote: (projectId, teacherId, noteText) =>
    ipcRenderer.invoke('projects:addNote', { projectId, teacherId, noteText }),
  getProjectPersonDetail: (projectId, teacherId) =>
    ipcRenderer.invoke('projects:getPersonDetail', { projectId, teacherId }),
  setProjectPersonStatus: (projectId, teacherId, status) =>
    ipcRenderer.invoke('projects:setStatus', { projectId, teacherId, status }),
  setProjectStatus: (projectId, status) => ipcRenderer.invoke('projects:setProjectStatus', { projectId, status }),
  updateProject: (projectId, name, description) =>
    ipcRenderer.invoke('projects:update', { projectId, name, description }),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', { projectId }),
});
