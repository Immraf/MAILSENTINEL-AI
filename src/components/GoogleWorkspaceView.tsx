import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckSquare,
  HardDrive,
  RefreshCw,
  Plus,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  FolderPlus,
  Shield,
  AlertCircle,
  Link,
  ChevronRight,
} from 'lucide-react';
import { GoogleCalendarEvent, GoogleTaskItem, GoogleDriveFile } from '../types';
import {
  fetchCalendarEvents,
  createGoogleCalendarEvent,
  fetchGoogleTasks,
  createGoogleTask,
  fetchDriveFiles,
  saveSummaryToGoogleDrive,
  openGooglePicker,
} from '../lib/workspace';
import { getCachedAccessToken } from '../lib/firebase';
import { User } from 'firebase/auth';

interface GoogleWorkspaceViewProps {
  googleUser: User | null;
  onSignInWithGoogle: () => void;
  isSigningIn?: boolean;
  onRequestConfirm: (params: {
    title: string;
    description: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmLabel?: string;
  }) => void;
  dailySummary?: string;
}

export const GoogleWorkspaceView: React.FC<GoogleWorkspaceViewProps> = ({
  googleUser,
  onSignInWithGoogle,
  isSigningIn = false,
  onRequestConfirm,
  dailySummary,
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'tasks' | 'drive'>('calendar');
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // New Event Form State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [newEventTime, setNewEventTime] = useState('10:00');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // New Task Form State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Drive Export State
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [lastExportedLink, setLastExportedLink] = useState<string | null>(null);

  const token = getCachedAccessToken();

  // Load active tab data when token or tab changes
  useEffect(() => {
    if (!token) return;

    if (activeTab === 'calendar') {
      loadCalendar();
    } else if (activeTab === 'tasks') {
      loadTasks();
    } else if (activeTab === 'drive') {
      loadDrive();
    }
  }, [activeTab, token]);

  const showTempStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const loadCalendar = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken) return;
    setIsLoading(true);
    try {
      const events = await fetchCalendarEvents(currentToken);
      setCalendarEvents(events);
    } catch (err: any) {
      console.error('Failed to load Google Calendar events:', err);
      showTempStatus(`Calendar sync notice: ${err.message || 'Check connection'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasks = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken) return;
    setIsLoading(true);
    try {
      const taskList = await fetchGoogleTasks(currentToken);
      setTasks(taskList);
    } catch (err: any) {
      console.error('Failed to load Google Tasks:', err);
      showTempStatus(`Tasks sync notice: ${err.message || 'Check connection'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDrive = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken) return;
    setIsLoading(true);
    try {
      const files = await fetchDriveFiles(currentToken);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Failed to load Drive files:', err);
      showTempStatus(`Drive sync notice: ${err.message || 'Check connection'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken || !newEventTitle.trim()) return;

    const startDateTime = new Date(`${newEventDate}T${newEventTime}:00`).toISOString();
    const endDateTime = new Date(new Date(startDateTime).getTime() + 3600000).toISOString();

    onRequestConfirm({
      title: 'Create Google Calendar Event?',
      description: `Create "${newEventTitle}" on ${newEventDate} at ${newEventTime} in your primary Google Calendar?`,
      confirmLabel: 'Confirm & Schedule',
      onConfirm: async () => {
        setIsSubmittingEvent(true);
        try {
          const created = await createGoogleCalendarEvent(currentToken, {
            summary: newEventTitle.trim(),
            description: newEventDescription.trim() || 'Created via MailSentinel AI Assistant',
            startDateTime,
            endDateTime,
          });
          setCalendarEvents((prev) => [created, ...prev]);
          setShowEventModal(false);
          setNewEventTitle('');
          setNewEventDescription('');
          showTempStatus('Event scheduled in Google Calendar successfully.');
        } catch (err: any) {
          console.error('Error creating event:', err);
          showTempStatus(`Failed to create event: ${err.message}`);
        } finally {
          setIsSubmittingEvent(false);
        }
      },
    });
  };

  const handleCreateTask = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken || !newTaskTitle.trim()) return;

    onRequestConfirm({
      title: 'Add Google Task?',
      description: `Add task "${newTaskTitle}"${newTaskDueDate ? ` due on ${newTaskDueDate}` : ''} to your Google Tasks?`,
      confirmLabel: 'Add Task',
      onConfirm: async () => {
        setIsSubmittingTask(true);
        try {
          const created = await createGoogleTask(currentToken, {
            title: newTaskTitle.trim(),
            notes: newTaskNotes.trim() || 'Created via MailSentinel AI',
            due: newTaskDueDate ? new Date(`${newTaskDueDate}T00:00:00Z`).toISOString() : undefined,
          });
          setTasks((prev) => [created, ...prev]);
          setShowTaskModal(false);
          setNewTaskTitle('');
          setNewTaskNotes('');
          setNewTaskDueDate('');
          showTempStatus('Task added to Google Tasks.');
        } catch (err: any) {
          console.error('Error creating task:', err);
          showTempStatus(`Failed to create task: ${err.message}`);
        } finally {
          setIsSubmittingTask(false);
        }
      },
    });
  };

  const handleSaveBriefingToDrive = async () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken) return;

    const content = dailySummary || 'MailSentinel AI Briefing: All mailboxes protected and up to date.';
    const title = `MailSentinel_AI_Briefing_${new Date().toISOString().split('T')[0]}`;

    onRequestConfirm({
      title: 'Export AI Briefing to Google Drive?',
      description: `This will create a new text document titled "${title}.txt" directly in your Google Drive.`,
      confirmLabel: 'Save to Drive',
      onConfirm: async () => {
        setIsSavingToDrive(true);
        try {
          const res = await saveSummaryToGoogleDrive(currentToken, title, content);
          if (res.webViewLink) setLastExportedLink(res.webViewLink);
          showTempStatus('AI Briefing saved to Google Drive!');
          loadDrive();
        } catch (err: any) {
          console.error('Failed to save to Drive:', err);
          showTempStatus(`Drive save failed: ${err.message}`);
        } finally {
          setIsSavingToDrive(false);
        }
      },
    });
  };

  const handleOpenPicker = () => {
    const currentToken = getCachedAccessToken();
    if (!currentToken) {
      onSignInWithGoogle();
      return;
    }

    const opened = openGooglePicker(
      currentToken,
      (pickedFile) => {
        showTempStatus(`Selected from Google Drive: "${pickedFile.name}"`);
        setDriveFiles((prev) => {
          if (prev.some((f) => f.id === pickedFile.id)) return prev;
          return [
            {
              id: pickedFile.id,
              name: pickedFile.name,
              mimeType: pickedFile.mimeType,
              webViewLink: pickedFile.url,
            },
            ...prev,
          ];
        });
      },
      () => {
        // user cancelled picker
      }
    );

    if (!opened) {
      showTempStatus('Opening Google Drive Picker... (If popup was blocked, allow popups)');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Top Banner & OAuth Connection Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Google Workspace Integration</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Gmail • Calendar • Drive • Picker • Tasks
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Connect your authorized Google account to schedule calendar events, track tasks, and attach Drive documents.
            </p>
          </div>
        </div>

        <div>
          {googleUser ? (
            <div className="flex items-center gap-3 bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700">
              {googleUser.photoURL ? (
                <img
                  src={googleUser.photoURL}
                  alt={googleUser.displayName || 'Google User'}
                  className="w-7 h-7 rounded-full border border-slate-600"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center text-white text-xs font-bold">
                  {(googleUser.email || 'G')[0].toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">
                    {googleUser.displayName || googleUser.email}
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Workspace Authorized</span>
              </div>
            </div>
          ) : (
            <button
              id="google-signin-btn"
              onClick={onSignInWithGoogle}
              disabled={isSigningIn}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg shadow-sm border transition ${
                isSigningIn
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'text-slate-700 bg-white hover:bg-slate-100 border-slate-300'
              }`}
            >
              {isSigningIn ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{isSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-200 text-xs flex items-center justify-between animate-in fade-in">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            id="workspace-tab-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'calendar'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Google Calendar</span>
            {calendarEvents.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
                {calendarEvents.length}
              </span>
            )}
          </button>

          <button
            id="workspace-tab-tasks"
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'tasks'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Google Tasks</span>
            {tasks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                {tasks.length}
              </span>
            )}
          </button>

          <button
            id="workspace-tab-drive"
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'drive'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Google Drive & Picker</span>
            {driveFiles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px]">
                {driveFiles.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 pb-2">
          {activeTab === 'calendar' && (
            <button
              id="refresh-calendar-btn"
              onClick={loadCalendar}
              disabled={isLoading || !token}
              className="p-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition disabled:opacity-40"
              title="Refresh Calendar"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {activeTab === 'tasks' && (
            <button
              id="refresh-tasks-btn"
              onClick={loadTasks}
              disabled={isLoading || !token}
              className="p-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition disabled:opacity-40"
              title="Refresh Tasks"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {activeTab === 'drive' && (
            <button
              id="refresh-drive-btn"
              onClick={loadDrive}
              disabled={isLoading || !token}
              className="p-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition disabled:opacity-40"
              title="Refresh Drive Files"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Google Calendar View */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Scheduled Calendar Events</h3>
              <p className="text-xs text-slate-400">Events synced directly with your Google Calendar.</p>
            </div>

            <button
              id="open-create-event-modal-btn"
              onClick={() => setShowEventModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Event</span>
            </button>
          </div>

          {!token ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-3">
              <Calendar className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs">Sign in with Google to view and schedule events on your Google Calendar.</p>
              <button
                onClick={onSignInWithGoogle}
                disabled={isSigningIn}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
                  isSigningIn
                    ? 'bg-indigo-900/50 text-indigo-300 cursor-not-allowed'
                    : 'text-white bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {isSigningIn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSigningIn ? 'Connecting...' : 'Connect Google Calendar'}</span>
              </button>
            </div>
          ) : calendarEvents.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs">No upcoming events found on Google Calendar.</p>
              <button
                onClick={() => setShowEventModal(true)}
                className="text-xs text-indigo-400 hover:underline"
              >
                + Schedule an event now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {calendarEvents.map((evt) => {
                const startDate = evt.start.dateTime
                  ? new Date(evt.start.dateTime).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : evt.start.date;
                const startTime = evt.start.dateTime
                  ? new Date(evt.start.dateTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'All day';

                return (
                  <div
                    key={evt.id}
                    className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-200 tracking-tight leading-snug">
                          {evt.summary}
                        </h4>
                        {evt.htmlLink && (
                          <a
                            href={evt.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-indigo-400 p-1"
                            title="Open in Google Calendar"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {evt.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{evt.description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-1 text-indigo-300 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>
                          {startDate} at {startTime}
                        </span>
                      </div>
                      {evt.location && <span className="text-[10px] truncate max-w-[120px]">{evt.location}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Google Tasks View */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Action Items & Google Tasks</h3>
              <p className="text-xs text-slate-400">Tasks synced directly with your Google Tasks account.</p>
            </div>

            <button
              id="open-create-task-modal-btn"
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>

          {!token ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-3">
              <CheckSquare className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs">Sign in with Google to synchronize and manage Google Tasks.</p>
              <button
                onClick={onSignInWithGoogle}
                disabled={isSigningIn}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
                  isSigningIn
                    ? 'bg-indigo-900/50 text-indigo-300 cursor-not-allowed'
                    : 'text-white bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {isSigningIn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSigningIn ? 'Connecting...' : 'Connect Google Tasks'}</span>
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs">All caught up! No active tasks found on Google Tasks.</p>
              <button
                onClick={() => setShowTaskModal(true)}
                className="text-xs text-indigo-400 hover:underline"
              >
                + Create a task now
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        t.status === 'completed'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600 bg-slate-800'
                      }`}
                    >
                      {t.status === 'completed' && <CheckSquare className="w-3 h-3" />}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`font-medium ${
                          t.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.notes && <p className="text-[11px] text-slate-400 truncate">{t.notes}</p>}
                    </div>
                  </div>

                  {t.due && (
                    <span className="text-[11px] font-mono text-amber-300/80 shrink-0">
                      Due {new Date(t.due).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Google Drive & Picker View */}
      {activeTab === 'drive' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Google Drive Files & Picker</h3>
              <p className="text-xs text-slate-400">
                Browse documents, attach files using Google Picker, or export AI summaries to Drive.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="open-google-picker-btn"
                onClick={handleOpenPicker}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-800/60 rounded-lg transition"
              >
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open Google Picker</span>
              </button>

              <button
                id="export-summary-to-drive-btn"
                onClick={handleSaveBriefingToDrive}
                disabled={isSavingToDrive || !token}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-40"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{isSavingToDrive ? 'Saving...' : 'Save AI Briefing to Drive'}</span>
              </button>
            </div>
          </div>

          {lastExportedLink && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
              <span>Successfully saved AI Briefing to your Google Drive!</span>
              <a
                href={lastExportedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 underline text-emerald-400 hover:text-emerald-200"
              >
                <span>Open in Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {!token ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-3">
              <HardDrive className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs">Sign in with Google to browse and select files from Google Drive.</p>
              <button
                onClick={onSignInWithGoogle}
                disabled={isSigningIn}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
                  isSigningIn
                    ? 'bg-indigo-900/50 text-indigo-300 cursor-not-allowed'
                    : 'text-white bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {isSigningIn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSigningIn ? 'Connecting...' : 'Connect Google Drive'}</span>
              </button>
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
              <FileText className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs">No Google Drive files listed yet.</p>
              <button onClick={handleOpenPicker} className="text-xs text-cyan-400 hover:underline">
                Use Google Picker to select a document from Drive
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {driveFiles.map((file) => (
                <div
                  key={file.id}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-2 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-800 text-cyan-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{file.mimeType}</p>
                    </div>
                  </div>

                  {file.webViewLink && (
                    <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        <span>View Document</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Calendar Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5 space-y-4 text-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Schedule Google Calendar Event</span>
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Event Title</label>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="e.g. Budget Review Meeting"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Time</label>
                  <input
                    type="time"
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  value={newEventDescription}
                  onChange={(e) => setNewEventDescription(e.target.value)}
                  placeholder="Context, agenda, or meeting details..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEvent}
                disabled={isSubmittingEvent || !newEventTitle.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-40"
              >
                {isSubmittingEvent ? 'Scheduling...' : 'Confirm & Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5 space-y-4 text-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-indigo-400" />
                <span>Create Google Task</span>
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Task Title</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Follow up on vendor invoice"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder="Additional context or checklist..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowTaskModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={isSubmittingTask || !newTaskTitle.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-40"
              >
                {isSubmittingTask ? 'Creating...' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
