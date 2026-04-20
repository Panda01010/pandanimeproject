"use client";

import { useEffect, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState('Idle');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [gptResponse, setGptResponse] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [scriptStatus, setScriptStatus] = useState('No script yet');
  const [promptsPath, setPromptsPath] = useState('');
  const [gridPaths, setGridPaths] = useState<string[]>([]);
  const [gridBlocks, setGridBlocks] = useState<string[]>([]);
  const [gridApprovals, setGridApprovals] = useState<boolean[]>([]);
  const [selectedGridIndex, setSelectedGridIndex] = useState(0);
  const [grid1Text, setGrid1Text] = useState('');
  const [selectedGridText, setSelectedGridText] = useState('');
  const [selectedGridDirty, setSelectedGridDirty] = useState(false);
  const [selectedGridSaving, setSelectedGridSaving] = useState(false);
  const [selectedGridApproving, setSelectedGridApproving] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const [failureArtifacts, setFailureArtifacts] = useState<{ screenshotPath?: string; logPath?: string } | null>(null);
  const [projectName, setProjectName] = useState('');
  const [activeProjectName, setActiveProjectName] = useState('');
  const [activeProjectPath, setActiveProjectPath] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>(['App loaded']);
  const [activeTab, setActiveTab] = useState<'project' | 'script' | 'characters' | 'grids' | 'grid-assets' | 'extraction' | 'logs'>('project');
  const [detectingReady, setDetectingReady] = useState(false);
  const [gridIsReady, setGridIsReady] = useState(false);
  const [downloadingResult, setDownloadingResult] = useState(false);
  const [downloadedPaths, setDownloadedPaths] = useState<string[]>([]);
  const [projectGridImages, setProjectGridImages] = useState<string[]>([]);
  const [imageApprovals, setImageApprovals] = useState<Record<string, string>>({});
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [extractedShots, setExtractedShots] = useState<Record<number, string[]>>({});
  const [viewingExtracted, setViewingExtracted] = useState<number | null>(null);
  const [lastTick, setLastTick] = useState(Date.now());
  const [generatingProgress, setGeneratingProgress] = useState<{ gridIndex: number; phase: string; pct: number } | null>(null);
  const [generatingAllGrids, setGeneratingAllGrids] = useState(false);
  const [generatingAllQueue, setGeneratingAllQueue] = useState<{ current: number; total: number; currentGridIndex: number } | null>(null);
  const [generatedGrids, setGeneratedGrids] = useState<number[]>([]); // persisted in metadata.json
  const [extractingAll, setExtractingAll] = useState(false);
  const [extractingAllQueue, setExtractingAllQueue] = useState<{ current: number; total: number; currentGridIndex: number } | null>(null);
  const [shotSources, setShotSources] = useState<Record<string, string>>({});
  const [editingShot, setEditingShot] = useState<string | null>(null);
  const [characters, setCharacters] = useState<{ id: string; name: string; description: string; generated?: boolean }[]>([]);
  const [generatingCharacters, setGeneratingCharacters] = useState(false);
  const [characterProgress, setCharacterProgress] = useState<Record<string, 'pending' | 'generating' | 'done' | 'error'>>({});
  const [charGenPhase, setCharGenPhase] = useState<Record<string, { phase: string; pct: number }>>({});
  const [newCharName, setNewCharName] = useState('');
  const [newCharDescription, setNewCharDescription] = useState('');
  const [addingChar, setAddingChar] = useState(false);
  const [uploadingCharId, setUploadingCharId] = useState<string | null>(null);
  const [minExtDelay, setMinExtDelay] = useState(10);
  const [maxExtDelay, setMaxExtDelay] = useState(20);
  // Shot source assignments: gridIdx -> { shotSlot(1-9) -> filename }
  const [shotAssignments, setShotAssignments] = useState<Record<number, Record<number, string>>>({});
  // which grid's config panel is expanded
  const [configGridIdx, setConfigGridIdx] = useState<number | null>(null);
  // which shot is currently being regenerated (shotFile stem e.g. '4')
  const [regeneratingShot, setRegeneratingShot] = useState<string | null>(null);
  
  const [followUpText, setFollowUpText] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [hasGptConversation, setHasGptConversation] = useState(false);

  // GPT selector
  const [savedGpts, setSavedGpts] = useState<{ id: string; name: string; url: string }[]>([]);
  const [selectedGptId, setSelectedGptId] = useState<string>('default');
  const [showAddGpt, setShowAddGpt] = useState(false);
  const [newGptName, setNewGptName] = useState('');
  const [newGptUrl, setNewGptUrl] = useState('');
  const [savingGpt, setSavingGpt] = useState(false);
  // Video generation states
  const [gridDescriptions, setGridDescriptions] = useState<{ style: string; setting: string; shots: Record<number, string> }[]>([]);
  const [tweakingVideoShot, setTweakingVideoShot] = useState<{ gridIdx: number; shotId: string; prompt: string } | null>(null);
  const [generatingVideoShot, setGeneratingVideoShot] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [videoSources, setVideoSources] = useState<Record<string, string>>({}); // current conversation URL (updates with each edit)
  const [videoOriginalSources, setVideoOriginalSources] = useState<Record<string, string>>({}); // first-ever generation URL (never overwritten)
  const [videoPrompts, setVideoPrompts] = useState<Record<string, string>>({});
  const [editingVideoShot, setEditingVideoShot] = useState<{ shotId: string; originalUrl: string; prompt: string } | null>(null);
  const [editingVideoInProgress, setEditingVideoInProgress] = useState<string | null>(null);
  const [upscalingVideoShot, setUpscalingVideoShot] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});

  // ── Real-time pipeline progress (SSE) ──────────────────────────────────────
  type PipelineKey = 'character' | 'grid' | 'extraction' | 'video';
  interface PipelineProgress {
    label: string;
    step: number;
    total: number;
    pct: number;
    subLabel?: string;
    done?: boolean;
    error?: boolean;
    ts: number; // last-updated timestamp
  }
  const [pipelineProgress, setPipelineProgress] = useState<Record<PipelineKey, PipelineProgress | null>>({
    character: null,
    grid: null,
    extraction: null,
    video: null,
  });

  const addLog = (message: string) => {
    const entry = `${new Date().toISOString()} ${message}`;
    console.log('[app]', entry);
    setLogs((current) => [entry, ...current].slice(0, 50));
  };

  const summarize = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 160);

  const applyParsedBlocks = (parsedBlocks: string[], promptsFilePath?: string, extractedGridPaths?: string[], approvals?: any) => {
    setGridBlocks(parsedBlocks);
    const approvalList = Array.isArray(approvals) ? approvals : [];
    setGridApprovals(parsedBlocks.map((_, index) => approvalList.includes(index)));

    // Improved: Only reset to 0 if our current selection is now out of bounds (e.g., blocks were deleted)
    setSelectedGridIndex((current) => {
      if (current >= 0 && current < parsedBlocks.length) return current;
      return 0;
    });

    setGrid1Text(parsedBlocks[0] ?? '');
    // Improved: Update selected text to match the (potentially updated) block at current index
    setSelectedGridText((currentText) => {
      // We use a functional update and access the latest parsedBlocks from the closure
      // but React state updates aren't immediate, so we'll rely on the parent logic
      return parsedBlocks[selectedGridIndex] ?? parsedBlocks[0] ?? '';
    });
    setSelectedGridDirty(false);
    setPromptsPath(promptsFilePath ?? '');
    setGridPaths(extractedGridPaths ?? []);
  };

  useEffect(() => {
    const loadStatus = async () => {
      addLog('loading browser status');
      const response = await fetch('/api/open-browser');
      const data = await response.json();
      addLog(`browser status loaded: ${Boolean(data.open)}`);
      setBrowserOpen(Boolean(data.open));
      setSavedPath(data.savedPath ?? '');
      setGenerationFailed(Boolean(data.generationFailed));
      setFailureReason(data.failureReason ?? '');
      setFailureArtifacts(data.failureArtifacts ?? null);
      setStatus('Idle');
      setActiveProjectName(data.projectName ?? '');
      setActiveProjectPath(data.projectPath || '');
      setScriptText(typeof data.scriptText === 'string' ? data.scriptText : '');
      setGptResponse(data.gptResponse ?? '');
      setScriptStatus(typeof data.scriptText === 'string' && data.scriptText ? 'Script loaded' : 'No script yet');
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setProjectGridImages(Array.isArray(data.gridImages) ? data.gridImages : []);
      setImageApprovals(data.imageApprovals || {});
      setExtractedShots(data.extractedShots || {});
      setShotSources(data.shotSources || {});
      setShotAssignments(data.shotAssignments || {});
      setCharacters(Array.isArray(data.characters) ? data.characters : []);
      if (Array.isArray(data.generatedGrids)) setGeneratedGrids(data.generatedGrids);
      if (data.videoSources) setVideoSources(data.videoSources);
      if (data.videoOriginalSources) setVideoOriginalSources(data.videoOriginalSources);
      if (data.videoPrompts) setVideoPrompts(data.videoPrompts);
      setHasGptConversation(!!data.hasGptConversation);
      applyParsedBlocks(Array.isArray(data.parsed) ? data.parsed : [], data.promptsPath ?? '', Array.isArray(data.gridPaths) ? data.gridPaths : [], Array.isArray(data.gridApprovals) ? data.gridApprovals : []);
    };

    loadStatus().catch((error) => addLog(`browser status load failed: ${error instanceof Error ? error.message : String(error)}`));

    // Load saved GPTs
    fetch('/api/gpts').then(r => r.json()).then(data => {
      if (Array.isArray(data.gpts)) setSavedGpts(data.gpts);
      if (data.selectedId) setSelectedGptId(data.selectedId);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── SSE: live pipeline progress ────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/progress');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.pipeline) return;
        setPipelineProgress(prev => ({
          ...prev,
          [data.pipeline as PipelineKey]: {
            label: data.label,
            step: data.step,
            total: data.total,
            pct: data.pct,
            subLabel: data.subLabel,
            done: data.done,
            error: data.error,
            ts: Date.now(),
          },
        }));
        // Auto-clear 4s after a pipeline marks itself done
        if (data.done || data.error) {
          setTimeout(() => {
            setPipelineProgress(prev => ({ ...prev, [data.pipeline as PipelineKey]: null }));
          }, 4000);
        }
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, []);

  // Live Heartbeat Sync
  useEffect(() => {
    if (!activeProjectName) return;

    addLog('Starting live-sync heartbeat');
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/open-browser');
        const data = await response.json();

        // Only update states that might change during extraction
        if (data.extractedShots) setExtractedShots(data.extractedShots);
        if (data.shotSources) setShotSources(data.shotSources);
        if (data.gridPaths) setGridPaths(data.gridPaths);
        if (data.open !== undefined) setBrowserOpen(data.open);
        if (Array.isArray(data.gridDescriptions)) setGridDescriptions(data.gridDescriptions);
        
        // Only update videos if the list actually changed to prevent player resets
        if (Array.isArray(data.generatedVideos)) {
          setGeneratedVideos(prev => {
            if (JSON.stringify(prev) === JSON.stringify(data.generatedVideos)) return prev;
            return data.generatedVideos;
          });
        }
        if (data.videoSources && typeof data.videoSources === 'object') setVideoSources(data.videoSources);
        if (data.videoOriginalSources && typeof data.videoOriginalSources === 'object') setVideoOriginalSources(data.videoOriginalSources);
        if (data.videoPrompts && typeof data.videoPrompts === 'object') setVideoPrompts(data.videoPrompts);

        setLastTick(Date.now());
      } catch (e) {
        // Silently ignore poll errors to keep UI clean
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeProjectName]);

  const refreshProjectState = async (fallbackName?: string) => {
    const refreshResponse = await fetch('/api/open-browser');
    const refreshData = await refreshResponse.json();
    const parsedBlocks = Array.isArray(refreshData.parsed) ? refreshData.parsed : [];
    setBrowserOpen(Boolean(refreshData.open));
    setProjects(Array.isArray(refreshData.projects) ? refreshData.projects : []);
    setSavedPath(refreshData.savedPath ?? '');
    setGenerationFailed(Boolean(refreshData.generationFailed));
    setFailureReason(refreshData.failureReason ?? '');
    setFailureArtifacts(refreshData.failureArtifacts ?? null);
    setActiveProjectName(refreshData.projectName ?? fallbackName ?? '');
    setActiveProjectPath(refreshData.projectPath ?? '');
    setScriptText(typeof refreshData.scriptText === 'string' ? refreshData.scriptText : '');
    setScriptStatus(typeof refreshData.scriptText === 'string' && refreshData.scriptText ? 'Script loaded' : 'No script yet');
    setProjectGridImages(Array.isArray(refreshData.gridImages) ? refreshData.gridImages : []);
    setExtractedShots(refreshData.extractedShots || {});
    setShotSources(refreshData.shotSources || {});
    setGridPaths(refreshData.gridPaths || []);
    setImageApprovals(refreshData.imageApprovals || {});
    setLastTick(Date.now());
    setCharacters(Array.isArray(refreshData.characters) ? refreshData.characters : []);
    if (Array.isArray(refreshData.generatedGrids)) setGeneratedGrids(refreshData.generatedGrids);
    if (Array.isArray(refreshData.gridDescriptions)) setGridDescriptions(refreshData.gridDescriptions);
    if (Array.isArray(refreshData.generatedVideos)) setGeneratedVideos(refreshData.generatedVideos);
    if (refreshData.videoSources && typeof refreshData.videoSources === 'object') setVideoSources(refreshData.videoSources);
    if (refreshData.videoOriginalSources && typeof refreshData.videoOriginalSources === 'object') setVideoOriginalSources(refreshData.videoOriginalSources);
    if (refreshData.videoPrompts && typeof refreshData.videoPrompts === 'object') setVideoPrompts(refreshData.videoPrompts);
    applyParsedBlocks(parsedBlocks, refreshData.promptsPath ?? '', Array.isArray(refreshData.gridPaths) ? refreshData.gridPaths : [], Array.isArray(refreshData.gridApprovals) ? refreshData.gridApprovals : []);
    return refreshData;
  };

  const handleOpenChatGPT = async () => {
    setStatus('Opening ChatGPT...');
    const response = await fetch('/api/open-browser', { method: 'PUT' });
    setBrowserOpen(response.ok);
    setStatus(response.ok ? 'ChatGPT opened' : 'Failed to open ChatGPT');
  };

  const handleSendToGPT = async () => {
    if (!activeProjectName) {
      setStatus('Create a project first');
      return;
    }

    setStatus('Sending to GPT...');
    setIsSending(true);
    setGptResponse('');
    addLog(`send to GPT started`);

    try {
      const response = await fetch('/api/open-browser', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptText }),
      });
      const data = await response.json();
      if (response.ok) {
        setStatus('Response received');
        setGptResponse(data.response ?? '');
        setSavedPath(data.savedPath ?? '');
        setHasGptConversation(true);
        if (Array.isArray(data.characters) && data.characters.length > 0) {
          setCharacters(data.characters);
          setCharacterProgress({});
          addLog(`parsed ${data.characters.length} characters from GPT response`);
          setActiveTab('characters');
        } else {
          const parseResponse = await fetch('/api/open-browser');
          const parseData = await parseResponse.json();
          applyParsedBlocks(Array.isArray(parseData.parsed) ? parseData.parsed : [], parseData.promptsPath ?? '', Array.isArray(parseData.gridPaths) ? parseData.gridPaths : [], Array.isArray(parseData.gridApprovals) ? parseData.gridApprovals : []);
          setActiveTab('grids');
        }
      } else {
        setStatus(`Failed: ${data.error ?? 'unknown error'}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFollowUpToGPT = async () => {
    if (!activeProjectName || !followUpText.trim()) return;

    setStatus('Sending Follow-up to GPT...');
    setIsSending(true);
    addLog(`send follow-up to GPT started`);

    try {
      const response = await fetch('/api/open-browser', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptText: followUpText, isFollowUp: true }),
      });
      const data = await response.json();
      if (response.ok) {
        setStatus('Follow-up Response received');
        setGptResponse(data.fullRawOutput ?? '');
        setSavedPath(data.savedPath ?? '');
        const parseResponse = await fetch('/api/open-browser');
        const parseData = await parseResponse.json();
        applyParsedBlocks(Array.isArray(parseData.parsed) ? parseData.parsed : [], parseData.promptsPath ?? '', Array.isArray(parseData.gridPaths) ? parseData.gridPaths : [], Array.isArray(parseData.gridApprovals) ? parseData.gridApprovals : []);
        setActiveTab('grids');
        setFollowUpText('');
      } else {
        setStatus(`Failed: ${data.error ?? 'unknown error'}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateProject = async () => {
    const name = projectName.trim();
    if (!name) {
      addLog('project creation blocked: name required');
      return;
    }

    setStatus('Creating project...');
    addLog(`create project clicked: ${name}`);
    const response = await fetch('/api/open-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: name }),
    });
    const data = await response.json();
    if (response.ok) {
      setActiveProjectName(data.projectName ?? name);
      setActiveProjectPath(data.projectPath ?? '');
      setProjects((current) => Array.from(new Set([...current, data.projectName ?? name])).sort((a, b) => a.localeCompare(b)));
      setBrowserOpen(true);
      setStatus('Project and AI Flow created');
      addLog(`project created at ${data.projectPath ?? 'unknown path'}`);
    } else {
      setStatus(`Failed: ${data.error ?? 'unknown error'}`);
      addLog(`project create failed: ${data.error ?? 'unknown error'}`);
    }
  };

  const handleOpenProject = async (name: string) => {
    setStatus('Opening project...');
    addLog(`open project clicked: ${name}`);
    const response = await fetch('/api/open-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: name, action: 'open' }),
    });
    const data = await response.json();
    if (response.ok) {
      setActiveProjectName(data.projectName ?? name);
      setActiveProjectPath(data.projectPath ?? '');
      setScriptText(typeof data.scriptText === 'string' ? data.scriptText : '');
      setScriptStatus(typeof data.scriptText === 'string' && data.scriptText ? 'Script loaded' : 'No script yet');
      setGptResponse(data.gptResponse ?? '');
      setSavedPath('');
      setLastPrompt('');
      setStatus('Project opened');
      const refreshData = await refreshProjectState(name);
      setBrowserOpen(Boolean(refreshData.open));
    } else {
      setStatus(`Failed: ${data.error ?? 'unknown error'}`);
      addLog(`project open failed: ${data.error ?? 'unknown error'}`);
    }
  };

  const handleDeleteProject = async (name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will permanently remove the project folder and all its contents.`)) return;
    setStatus('Deleting project...');
    addLog(`delete project clicked: ${name}`);
    const response = await fetch('/api/open-browser', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: name }),
    });
    const data = await response.json();
    if (response.ok) {
      setProjects(Array.isArray(data.projects) ? data.projects : (current: string[]) => current.filter((project: string) => project !== name));
      if (activeProjectName === name) {
        setActiveProjectName('');
        setActiveProjectPath('');
        setScriptText('');
        setScriptStatus('No script yet');
        setGptResponse('');
        setSavedPath('');
        setLastPrompt('');
        setPromptsPath('');
        setGridBlocks([]);
        setGridPaths([]);
        setGridApprovals([]);
        setSelectedGridIndex(0);
        setGrid1Text('');
        setSelectedGridText('');
        setSelectedGridDirty(false);
        setProjectGridImages([]);
        setImageApprovals({});
        setExtractedShots({});
        setShotSources({});
        setShotAssignments({});
        setCharacters([]);
        setGeneratedVideos([]);
        setVideoSources({});
        setVideoOriginalSources({});
        setVideoPrompts({});
        setGridDescriptions([]);
        setGenerationFailed(false);
        setFailureReason('');
        setFailureArtifacts(null);
        setHasGptConversation(false);
        setFollowUpText('');
        setShowFollowUp(false);
      }
      setStatus('Project deleted');
      addLog(`project deleted: ${name}`);
    } else {
      setStatus(`Failed: ${data.error ?? 'unknown error'}`);
      addLog(`project delete failed: ${data.error ?? 'unknown error'}`);
    }
  };

  const handleSelectGrid = (index: number) => {
    setSelectedGridIndex(index);
    setGrid1Text(gridBlocks[index] ?? '');
    setSelectedGridText(gridBlocks[index] ?? '');
    setSelectedGridDirty(false);
    addLog(`selected grid ${index + 1}`);
  };

  const handleEditGridText = (value: string) => {
    setSelectedGridText(value);
    setSelectedGridDirty(value !== (gridBlocks[selectedGridIndex] ?? ''));
  };

  const handleSaveGrid = async () => {
    if (!activeProjectName) return;
    setSelectedGridSaving(true);
    const response = await fetch('/api/open-browser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gridIndex: selectedGridIndex, gridText: selectedGridText }),
    });
    const data = await response.json();
    if (response.ok) {
      const next = [...gridBlocks];
      next[selectedGridIndex] = selectedGridText;
      setGridBlocks(next);
      setGrid1Text(selectedGridText);
      setSelectedGridDirty(false);
      await refreshProjectState(activeProjectName);
      setSelectedGridText(selectedGridText);
      addLog(`saved grid ${selectedGridIndex + 1}`);
    } else {
      addLog(`save grid failed: ${data.error ?? 'unknown error'}`);
    }
    setSelectedGridSaving(false);
  };

  const handleDeleteGridImage = async (filename: string) => {
    if (!activeProjectName) return;
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    addLog(`delete grid image requested: ${filename}`);
    const response = await fetch('/api/open-browser', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: activeProjectName, action: 'delete-grid-image', filename }),
    });

    if (response.ok) {
      setProjectGridImages(prev => prev.filter(f => f !== filename));
      addLog(`grid image deleted: ${filename}`);
    } else {
      const data = await response.json();
      addLog(`delete grid image failed: ${data.error ?? 'unknown error'}`);
    }
  };

  const handleApproveGrid = async (approved: boolean) => {
    if (!activeProjectName) return;
    setSelectedGridApproving(true);
    const response = await fetch('/api/open-browser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approveGridIndex: selectedGridIndex, approved }),
    });
    const data = await response.json();
    if (response.ok) {
      const next = [...gridApprovals];
      next[selectedGridIndex] = approved;
      setGridApprovals(next);
      addLog(`${approved ? 'approved' : 'unapproved'} grid ${selectedGridIndex + 1}`);
    } else {
      addLog(`approve grid failed: ${data.error ?? 'unknown error'}`);
    }
    setSelectedGridApproving(false);
  };

  const handleApproveGridImage = async (gridIndex: number, filename: string | null) => {
    if (!activeProjectName) return;
    const response = await fetch('/api/open-browser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approveImageGridIndex: gridIndex, approvedImageFilename: filename }),
    });
    if (response.ok) {
      setImageApprovals(prev => {
        const next = { ...prev };
        if (filename === null) delete next[String(gridIndex)];
        else next[String(gridIndex)] = filename;
        return next;
      });
      addLog(`${filename ? 'approved' : 'rejected'} image for Grid ${gridIndex + 1}`);
    } else {
      const data = await response.json();
      addLog(`Failed to save image approval: ${data.error ?? 'unknown error'}`);
    }
  };

  // Persist shot assignments to project metadata
  const handleSaveShotAssignments = async (newAssignments: Record<number, Record<number, string>>) => {
    if (!activeProjectName) return;
    await fetch('/api/open-browser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-shot-assignments', projectName: activeProjectName, assignments: newAssignments }),
    }).catch(() => {});
  };

  // Toggle a shot slot assignment: assign `filename` to `slot` for this gridIdx
  const handleToggleShotAssignment = (gridIdx: number, slot: number, filename: string) => {
    setShotAssignments(prev => {
      const gridMap = { ...(prev[gridIdx] ?? {}) };
      // If already assigned to this file, clear it (toggle off)
      if (gridMap[slot] === filename) {
        delete gridMap[slot];
      } else {
        gridMap[slot] = filename;
      }
      const next = { ...prev, [gridIdx]: gridMap };
      handleSaveShotAssignments(next);
      return next;
    });
  };

  const approvedGridIndexes = gridApprovals.reduce<number[]>((acc, approved, index) => {
    if (approved) acc.push(index);
    return acc;
  }, []);

  const handleGenerateImages = async () => {
    const gridIndex = selectedGridIndex;

    if (!gridApprovals[gridIndex]) {
      setStatus(`Grid ${gridIndex + 1} is not approved`);
      addLog(`generation blocked: Grid ${gridIndex + 1} is not approved`);
      return;
    }
    if (!activeProjectName) { setStatus('No active project'); return; }

    // Phase A: Submit the prompt to AI Flow
    setGeneratingProgress({ gridIndex, phase: 'Submitting prompt to AI Flow...', pct: 8 });
    setStatus(`Submitting Grid ${gridIndex + 1} to AI Flow`);
    addLog(`triggering generation for Grid ${gridIndex + 1}`);

    const submitRes = await fetch('/api/open-browser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open-ai-flow', projectName: activeProjectName, gridIndex }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) {
      setGeneratingProgress(null);
      setStatus(`Failed: ${submitData.error ?? 'unknown error'}`);
      return;
    }

    setBrowserOpen(true);

    // Phase B: Watch AI Flow until 2 images are ready, then download them
    setGeneratingProgress({ gridIndex, phase: 'Waiting for AI Flow to generate 2 images...', pct: 25 });
    setStatus(`Watching Grid ${gridIndex + 1} generation...`);
    addLog(`watching Grid ${gridIndex + 1} generation and auto-downloading`);

    // Animate progress bar from 25 → 85 over ~90s while waiting
    let animPct = 25;
    const animInterval = setInterval(() => {
      animPct = Math.min(animPct + 0.7, 85);
      setGeneratingProgress(prev => prev ? { ...prev, pct: animPct } : null);
    }, 800);

    try {
      const watchRes = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'watch-and-download', projectName: activeProjectName, gridIndex }),
      });
      clearInterval(animInterval);
      const watchData = await watchRes.json();

      if (watchRes.ok && watchData.savedPaths?.length > 0) {
        setGeneratingProgress({ gridIndex, phase: `Downloaded ${watchData.savedPaths.length} images!`, pct: 100 });
        setStatus(`Grid ${gridIndex + 1} complete — ${watchData.savedPaths.length} images saved`);
        addLog(`grid ${gridIndex + 1} auto-downloaded: ${watchData.savedPaths.length} files`);
        setDownloadedPaths(watchData.savedPaths);
        setProjectGridImages(prev => [...new Set([...prev, ...(watchData.savedPaths.map((p: string) => p.split(/[\\/]/).pop()))])]);
        await refreshProjectState(activeProjectName);
        setTimeout(() => setGeneratingProgress(null), 2000);
      } else {
        setGeneratingProgress(null);
        setStatus(`Grid watch failed: ${watchData.error ?? 'unknown error'}`);
        addLog(`watch-and-download failed: ${watchData.error}`);
      }
    } catch (err) {
      clearInterval(animInterval);
      setGeneratingProgress(null);
      setStatus('Generation watch failed');
      addLog(`watch-and-download error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /** Run all approved grids sequentially: submit → watch/download → next */
  const handleGenerateAllGrids = async () => {
    if (!activeProjectName) { setStatus('No active project'); return; }
    if (generatingProgress || generatingAllGrids) return;

    const approvedIndexes = gridApprovals.reduce<number[]>((acc, approved, idx) => {
      if (approved) acc.push(idx);
      return acc;
    }, []);

    if (approvedIndexes.length === 0) {
      setStatus('No approved grids to generate');
      return;
    }

    setGeneratingAllGrids(true);
    addLog(`Generate All started: ${approvedIndexes.length} approved grids`);

    let skippedCount = 0;

    for (let i = 0; i < approvedIndexes.length; i++) {
      const gridIndex = approvedIndexes[i];

      // ── Skip grids that already have a "created" tag (images downloaded to disk) ──
      if (generatedGrids.includes(gridIndex)) {
        addLog(`[Generate All] Grid ${gridIndex + 1} already created — skipping`);
        skippedCount++;
        continue;
      }

      setGeneratingAllQueue({ current: i + 1, total: approvedIndexes.length, currentGridIndex: gridIndex });
      setSelectedGridIndex(gridIndex);

      // ── Phase A: Submit ─────────────────────────────────────────
      const remaining = approvedIndexes.length - skippedCount;
      const processed = i + 1 - skippedCount;
      setStatus(`Grid ${gridIndex + 1} — submitting (${processed}/${remaining})`);
      setGeneratingProgress({ gridIndex, phase: 'Submitting prompt to AI Flow...', pct: 8 });
      addLog(`[Generate All] submitting Grid ${gridIndex + 1}`);

      const submitRes = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open-ai-flow', projectName: activeProjectName, gridIndex }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        setGeneratingProgress(null);
        addLog(`[Generate All] Grid ${gridIndex + 1} submit failed: ${submitData.error}`);
        setStatus(`Grid ${gridIndex + 1} failed — skipping`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      setBrowserOpen(true);

      // ── Phase B: Watch + Download ─────────────────────────────
      setStatus(`Grid ${gridIndex + 1} — waiting for images (${processed}/${remaining})`);
      setGeneratingProgress({ gridIndex, phase: 'Waiting for AI Flow to generate 2 images...', pct: 25 });
      addLog(`[Generate All] watching Grid ${gridIndex + 1}`);

      let animPct = 25;
      const animInterval = setInterval(() => {
        animPct = Math.min(animPct + 0.7, 85);
        setGeneratingProgress(prev => prev ? { ...prev, pct: animPct } : null);
      }, 800);

      try {
        const watchRes = await fetch('/api/open-browser', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'watch-and-download', projectName: activeProjectName, gridIndex }),
        });
        clearInterval(animInterval);
        const watchData = await watchRes.json();

        if (watchRes.ok && watchData.savedPaths?.length > 0) {
          setGeneratingProgress({ gridIndex, phase: `✓ Downloaded ${watchData.savedPaths.length} images`, pct: 100 });
          setStatus(`Grid ${gridIndex + 1} done (${processed}/${remaining})`);
          addLog(`[Generate All] Grid ${gridIndex + 1} complete: ${watchData.savedPaths.length} files`);
          // Update the in-memory created-tag immediately (also persisted in metadata.json on backend)
          setGeneratedGrids(prev => Array.from(new Set([...prev, gridIndex])));
          setProjectGridImages(prev => [...new Set([...prev, ...(watchData.savedPaths.map((p: string) => p.split(/[\\/]/).pop()))])]);
          await refreshProjectState(activeProjectName);
          setTimeout(() => setGeneratingProgress(null), 1500);
          await new Promise(r => setTimeout(r, 1500));
        } else {
          clearInterval(animInterval);
          setGeneratingProgress(null);
          addLog(`[Generate All] Grid ${gridIndex + 1} watch failed: ${watchData.error}`);
          setStatus(`Grid ${gridIndex + 1} watch failed — skipping`);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) {
        clearInterval(animInterval);
        setGeneratingProgress(null);
        addLog(`[Generate All] Grid ${gridIndex + 1} error: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    setGeneratingAllGrids(false);
    setGeneratingAllQueue(null);
    setGeneratingProgress(null);
    await refreshProjectState(activeProjectName);
    const doneCount = approvedIndexes.length - skippedCount;
    setStatus(`✓ Done — ${doneCount} generated, ${skippedCount} already had images (skipped)`);
    addLog(`[Generate All] finished — ${doneCount} generated, ${skippedCount} skipped`);
  };

  /** Extract shots for all grids that have an approved image — sequentially */
  const handleExtractAll = async () => {
    if (!activeProjectName || extractingAll) return;

    // Collect ONLY grids where user has explicitly assigned shots via slot buttons
    const approvedGrids = gridBlocks.reduce<{ gridIdx: number; approvedFile: string }[]>((acc, _, gridIdx) => {
      const assigned = shotAssignments[gridIdx] ?? {};
      if (Object.keys(assigned).length === 0) return acc; // skip grids with no assignments
      const gridStrNew = `Grid ${gridIdx + 1}`;
      const gridStrOld = `Grid-${gridIdx + 1}`;
      const theseImages = projectGridImages.filter(f =>
        f.includes(gridStrOld) || f.startsWith(gridStrNew + '.') || f.startsWith(gridStrNew + ' ')
      );
      const approvedFile = imageApprovals[String(gridIdx)] ?? imageApprovals[gridIdx as any] ?? theseImages[0];
      if (approvedFile) acc.push({ gridIdx, approvedFile });
      return acc;
    }, []);

    if (approvedGrids.length === 0) {
      setStatus('No grids have shot assignments yet — assign shots using the slot buttons first');
      return;
    }

    setExtractingAll(true);
    addLog(`Extract All started: ${approvedGrids.length} grids with shot assignments`);

    let skipped = 0;

    for (let i = 0; i < approvedGrids.length; i++) {
      const { gridIdx, approvedFile } = approvedGrids[i];

      // Skip grids that already have all 9 shots extracted
      const alreadyExtracted = (extractedShots[gridIdx] ?? []).length;
      if (alreadyExtracted >= 9) {
        addLog(`[Extract All] Grid ${gridIdx + 1} already has ${alreadyExtracted} shots — skipping`);
        skipped++;
        continue;
      }

      setExtractingAllQueue({ current: i + 1 - skipped, total: approvedGrids.length - skipped, currentGridIndex: gridIdx });
      setStatus(`Extracting Grid ${gridIdx + 1} (${i + 1 - skipped}/${approvedGrids.length - skipped})...`);
      addLog(`[Extract All] extracting Grid ${gridIdx + 1} from ${approvedFile}`);

      // Respect custom per-slot assignments for this grid
      const gridAssignments = shotAssignments[gridIdx] ?? {};
      const assignedSlotsCount = Object.keys(gridAssignments).length;
      const buildPayload = () =>
        Array.from({ length: 9 }, (_, i) => i + 1).map(slot => ({
          shotIndex: slot,
          filename: gridAssignments[slot] ?? approvedFile,
        }));

      const payload: Record<string, unknown> = {
        action: 'extract-shot',
        gridIndex: gridIdx,
        filename: approvedFile,
        projectName: activeProjectName,
        minDelay: minExtDelay,
        maxDelay: maxExtDelay,
      };
      if (assignedSlotsCount > 0) payload.shotAssignments = buildPayload();

      try {
        const res = await fetch('/api/open-browser', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          addLog(`[Extract All] Grid ${gridIdx + 1} extraction complete`);
          // Refresh extracted shots state
          const refreshRes = await fetch('/api/open-browser');
          if (refreshRes.ok) {
            const d = await refreshRes.json();
            if (d.extractedShots) setExtractedShots(d.extractedShots);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          addLog(`[Extract All] Grid ${gridIdx + 1} failed: ${(err as any).error ?? 'unknown'}`);
          setStatus(`Grid ${gridIdx + 1} extraction failed — skipping`);
        }
      } catch (err) {
        addLog(`[Extract All] Grid ${gridIdx + 1} error: ${err instanceof Error ? err.message : String(err)}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    setExtractingAll(false);
    setExtractingAllQueue(null);
    await refreshProjectState(activeProjectName);
    const done = approvedGrids.length - skipped;
    setStatus(`✓ Extract All done — ${done} extracted, ${skipped} already had shots (skipped)`);
    addLog(`[Extract All] finished — ${done} extracted, ${skipped} skipped`);
  };

  const handleDetectReady = async () => {
    if (!activeProjectName) return;
    setDetectingReady(true);
    setGridIsReady(false);
    setStatus('Detecting if grid is ready...');
    addLog('detect grid ready triggered');

    try {
      const response = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect-grid-ready', projectName: activeProjectName, gridIndex: selectedGridIndex }),
      });
      const data = await response.json();
      if (response.ok && data.isReady) {
        setGridIsReady(true);
        setStatus('Grid image is ready!');
        addLog('grid image detection successful');
      } else {
        setGridIsReady(false);
        setStatus(data.error ? `Detection failed: ${data.error}` : 'Grid is not ready yet');
        addLog(`grid detection result: ${data.isReady ? 'ready' : 'not ready'} ${data.error || ''}`);
      }
    } catch (error) {
      addLog(`detect ready failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDetectingReady(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!activeProjectName) return;
    setDownloadingResult(true);
    setStatus('Downloading grid image...');
    addLog(`download grid image triggered for Grid ${selectedGridIndex + 1}`);

    try {
      const response = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download-grid-image', projectName: activeProjectName, gridIndex: selectedGridIndex }),
      });
      const data = await response.json();
      if (response.ok) {
        setDownloadedPaths(data.savedPaths || []);
        setProjectGridImages(prev => [...new Set([...prev, ...(data.savedPaths?.map((p: string) => p.split(/[\\/]/).pop()) || [])])]);
        setStatus(`Saved ${data.savedPaths?.length || 1} images for Grid ${selectedGridIndex + 1}`);
        addLog(`grid images saved: ${data.savedPaths?.length}`);
        await refreshProjectState(activeProjectName);
      } else {
        setStatus(`Download failed: ${data.error ?? 'unknown error'}`);
        addLog(`grid download failed: ${data.error ?? 'unknown error'}`);
      }
    } catch (error) {
      addLog(`download failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloadingResult(false);
    }
  };

  const handleEditShot = async (shotId: string, currentUrl: string) => {
    if (!activeProjectName || !currentUrl) return;

    const tweakPrompt = window.prompt(`Update Shot ${shotId}\n\nEnter your correction (e.g. "make the hair red" or "change background to a forest"):`);
    if (!tweakPrompt) return;

    setEditingShot(shotId);
    setStatus(`Editing Shot ${shotId}...`);
    addLog(`tweak shot ${shotId} requested: ${tweakPrompt}`);

    try {
      const resp = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit-shot',
          projectName: activeProjectName,
          sourceUrl: currentUrl,
          tweakPrompt,
          targetFilename: `${shotId}.png`
        })
      });
      const data = await resp.json();
      if (data.ok) {
        addLog(`Shot ${shotId} updated and replaced successfully`);
        setLastTick(Date.now());
        await refreshProjectState(activeProjectName);
      } else {
        alert('Edit failed: ' + data.error);
      }
    } catch (e) {
      addLog('Edit error: ' + String(e));
    } finally {
      setEditingShot(null);
    }
  };

  const handleRedownloadShot = async (shotId: string, currentUrl: string) => {
    if (!activeProjectName || !currentUrl) return;

    setStatus(`Redownloading Shot ${shotId}...`);
    addLog(`redownload shot ${shotId} requested`);

    try {
      const resp = await fetch('/api/open-browser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'redownload-shot',
          projectName: activeProjectName,
          sourceUrl: currentUrl,
          targetFilename: `${shotId}.png`
        })
      });
      const data = await resp.json();
      if (data.ok) {
        addLog(`Shot ${shotId} redownloaded successfully`);
        setLastTick(Date.now());
        await refreshProjectState(activeProjectName);
      } else {
        alert('Redownload failed: ' + data.error);
      }
    } catch (e) {
      addLog('Redownload error: ' + String(e));
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px', fontFamily: 'Inter, system-ui, sans-serif', background: '#000000', color: '#ededed' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Header section */}
        <header style={{
          background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 24, padding: '32px 40px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div>
            <div style={{ background: '#111', border: '1px solid #222', color: '#888', display: 'inline-block', padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 16 }}>
              Production Pipeline
            </div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', color: '#ffffff' }}>Anime Studio Automator</h1>
          </div>
          <div style={{ display: 'flex', gap: 24, background: '#050505', padding: '16px 24px', borderRadius: 16, border: '1px solid #1a1a1a' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Status</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: generationFailed ? '#f87171' : '#fff' }}>{status}</span>
              {generationFailed && <span style={{ fontSize: 12, color: '#f87171' }}>{failureReason}</span>}
              {failureArtifacts?.screenshotPath && <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>{failureArtifacts.screenshotPath}</span>}

            </div>
            <div style={{ width: 1, background: '#222' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Browser</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: browserOpen ? '#4ade80' : '#f87171', boxShadow: browserOpen ? '0 0 10px #4ade80' : 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: browserOpen ? '#4ade80' : '#f87171' }}>{browserOpen ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <div style={{ width: 1, background: '#222' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Project</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{activeProjectName || 'None'}</span>
            </div>
          </div>
        </header>

        {/* ── Live Pipeline Progress Panel ── */}
        {(() => {
          const pipelines: { key: PipelineKey; label: string; color: string; icon: string }[] = [
            { key: 'character', label: 'Characters',  color: '#a78bfa', icon: '👤' },
            { key: 'grid',      label: 'Grid Foundry', color: '#38bdf8', icon: '🎨' },
            { key: 'extraction',label: 'Extraction',  color: '#fb923c', icon: '✂️' },
            { key: 'video',     label: 'Video',        color: '#4ade80', icon: '🎬' },
          ];
          const activePipelines = pipelines.filter(p => pipelineProgress[p.key] !== null);
          if (activePipelines.length === 0) return null;
          return (
            <div style={{
              background: '#0a0a0a', border: '1px solid #1e1e2e', borderRadius: 20,
              padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
              boxShadow: '0 0 40px rgba(99,102,241,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1', animation: 'sseblip 1.5s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: 1.2, textTransform: 'uppercase' }}>Pipeline Activity</span>
              </div>
              {activePipelines.map(({ key, label, color, icon }) => {
                const prog = pipelineProgress[key]!;
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color, letterSpacing: 0.3 }}>{label}</span>
                        {prog.subLabel && (
                          <span style={{ fontSize: 11, color: '#555', background: '#111', padding: '2px 8px', borderRadius: 6, border: '1px solid #222' }}>
                            {prog.subLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#444' }}>Step {prog.step}/{prog.total}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: prog.done ? '#4ade80' : prog.error ? '#f87171' : color }}>{prog.pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: '#111', borderRadius: 99, overflow: 'hidden', border: '1px solid #1a1a1a' }}>
                      <div style={{
                        height: '100%', width: `${prog.pct}%`, borderRadius: 99, transition: 'width 0.5s ease',
                        background: prog.done ? '#4ade80' : prog.error ? '#f87171' : `linear-gradient(90deg, ${color}88, ${color})`,
                        boxShadow: prog.done ? '0 0 8px #4ade80' : `0 0 10px ${color}55`,
                      }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!prog.done && !prog.error && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, animation: 'sseblip 1s infinite' }} />}
                      {prog.done && <span style={{ color: '#4ade80', fontSize: 13 }}>✓</span>}
                      {prog.error && <span style={{ color: '#f87171', fontSize: 13 }}>✗</span>}
                      <span style={{ fontSize: 11, color: prog.done ? '#4ade80' : prog.error ? '#f87171' : '#888' }}>{prog.label}</span>
                    </div>
                  </div>
                );
              })}
              <style>{`@keyframes sseblip { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
            </div>
          );
        })()}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: 8, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, width: 'fit-content', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          {[
            { name: '1. Vault', id: 'project' },
            { name: '2. Script Engine', id: 'script' },
            { name: '3. Characters', id: 'characters' },
            { name: '4. Grid Foundry', id: 'grids' },
            { name: '5. Grid Assets', id: 'grid-assets' },
            { name: '6. Extraction Flow', id: 'extraction' },
            { name: 'Logs', id: 'logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: activeTab === tab.id ? '#ffffff' : 'transparent', color: activeTab === tab.id ? '#000000' : '#888888', fontWeight: activeTab === tab.id ? 600 : 500, cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s ease' }}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <section style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 24, padding: 40, minHeight: 500, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', position: 'relative', overflow: 'hidden' }}>

          <div style={{ position: 'absolute', top: 0, left: '20%', width: '60%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />

          {activeTab === 'project' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeIn 0.3s ease' }}>
              <div>
                <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>Project Vault</h2>
                <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>Initialize a new workspace or open an existing one to load your production assets and state.</p>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter a new project name..."
                  style={{ width: 320, padding: '16px 20px', borderRadius: 12, border: '1px solid #222', background: '#050505', color: '#fff', fontSize: 15, outline: 'none' }}
                />
                <button
                  onClick={handleCreateProject}
                  style={{ padding: '16px 28px', borderRadius: 12, border: 'none', background: '#fff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                >
                  Create New Project
                </button>
              </div>

              {projects.length > 0 && (
                <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 40 }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Available Projects ({projects.length})</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {projects.map((name) => (
                      <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px', background: '#050505', border: activeProjectName === name ? '1px solid #444' : '1px solid #1a1a1a', borderRadius: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 16, fontWeight: 500, color: activeProjectName === name ? '#fff' : '#aaa' }}>{name}</span>
                          {activeProjectName === name && <span style={{ fontSize: 10, padding: '4px 8px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: 6, color: '#4ade80', fontWeight: 600, textTransform: 'uppercase' }}>Active</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                          <button onClick={() => handleOpenProject(name)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Open Project</button>
                          <button onClick={() => handleDeleteProject(name)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ef444433', background: 'transparent', color: '#f87171', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'characters' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, animation: 'fadeIn 0.3s ease' }}>
              <div>
                <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>Character Roster</h2>
                <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>
                  Generate each character in AI Flow. One reference image will be downloaded and matched by prompt — lock it to use as <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>@Reference</code>.
                </p>
              </div>

              {/* Manual add character form */}
              <div style={{ background: '#050505', border: '1px solid #1a1a1a', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Add Character Manually</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <input
                    id="new-char-name"
                    placeholder="Name (e.g. Goku)"
                    value={newCharName}
                    onChange={e => setNewCharName(e.target.value)}
                    style={{ flex: '0 0 160px', padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <input
                    id="new-char-description"
                    placeholder="Description (e.g. tall spiky-haired warrior in orange gi)"
                    value={newCharDescription}
                    onChange={e => setNewCharDescription(e.target.value)}
                    style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <button
                    id="add-char-btn"
                    disabled={addingChar || !newCharName.trim() || !newCharDescription.trim() || !activeProjectName}
                    onClick={async () => {
                      if (!activeProjectName || !newCharName.trim() || !newCharDescription.trim()) return;
                      setAddingChar(true);
                      try {
                        const res = await fetch('/api/open-browser', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'add-character', projectName: activeProjectName, characterName: newCharName.trim(), characterDescription: newCharDescription.trim() }),
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setCharacters(data.characters);
                          setNewCharName('');
                          setNewCharDescription('');
                          addLog(`added character @${newCharName.trim()}`);
                        } else {
                          addLog(`add character failed: ${data.error}`);
                        }
                      } catch (err) {
                        addLog(`add character error: ${String(err)}`);
                      } finally {
                        setAddingChar(false);
                      }
                    }}
                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: newCharName.trim() && newCharDescription.trim() ? '#a78bfa' : '#1a1a1a', color: newCharName.trim() && newCharDescription.trim() ? '#fff' : '#555', fontSize: 13, fontWeight: 600, cursor: newCharName.trim() && newCharDescription.trim() && activeProjectName ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
                  >
                    {addingChar ? 'Adding...' : '+ Add'}
                  </button>
                </div>
              </div>

              {characters.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#444', fontSize: 15, fontStyle: 'italic' }}>
                  No characters yet. Send your script to GPT first — characters defined with <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>@Name: description</code> will appear here.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {characters.map((char) => {
                  const anyChar = char as any;
                  const prog = characterProgress[char.id];
                  const isGenerating = prog === 'generating';
                  const isError = prog === 'error';
                  const phase = charGenPhase[char.id];
                  const imagePaths: string[] = anyChar.imagePaths ?? [];
                  const approvedVariation: string | null = anyChar.approvedVariation ?? null;
                  const hasImages = imagePaths.length > 0;
                  const isLocked: boolean = !!approvedVariation;

                  return (
                    <div key={char.id} style={{
                      background: '#050505',
                      border: `1px solid ${isLocked ? 'rgba(74,222,128,0.35)' : isError ? 'rgba(248,113,113,0.3)' : '#1a1a1a'}`,
                      borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
                      transition: 'border-color 0.3s',
                    }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>@{char.name}</span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete character @${char.name}?`)) return;
                                const res = await fetch('/api/open-browser', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'delete-character', projectName: activeProjectName, characterId: char.id })
                                });
                                const d = await res.json();
                                if (d.ok) { setCharacters(d.characters); addLog(`deleted character @${char.name}`); }
                              }}
                              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                              title="Delete Character"
                            >
                              ✕
                            </button>
                            {isLocked && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(74,222,128,0.12)', color: '#4ade80', textTransform: 'uppercase' }}>
                                ✓ Locked
                              </span>
                            )}
                            {isError && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(248,113,113,0.12)', color: '#f87171', textTransform: 'uppercase' }}>
                                ✗ Failed
                              </span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#666', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {char.description}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>

                          {/* Upload Reference button */}
                          <label
                            htmlFor={`upload-ref-${char.id}`}
                            style={{
                              padding: '10px 14px', borderRadius: 10, border: '1px solid #333',
                              background: uploadingCharId === char.id ? '#1a1a1a' : 'transparent',
                              color: uploadingCharId === char.id ? '#555' : '#ccc',
                              fontSize: 13, fontWeight: 600, cursor: uploadingCharId === char.id || !activeProjectName ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                            title="Upload your own reference image for this character"
                          >
                            {uploadingCharId === char.id ? (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Uploading...</>
                            ) : (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Ref</>
                            )}
                          </label>
                          <input
                            id={`upload-ref-${char.id}`}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !activeProjectName) return;
                              e.target.value = '';
                              setUploadingCharId(char.id);
                              addLog(`uploading reference for @${char.name}: ${file.name}`);
                              try {
                                const fd = new FormData();
                                fd.append('projectName', activeProjectName);
                                fd.append('characterId', char.id);
                                fd.append('file', file);
                                const res = await fetch('/api/upload-character', { method: 'POST', body: fd });
                                const data = await res.json();
                                if (data.ok) {
                                  setCharacters(data.characters);
                                  addLog(`uploaded reference for @${char.name}: ${data.fileName}`);
                                } else {
                                  addLog(`upload failed for @${char.name}: ${data.error}`);
                                }
                              } catch (err) {
                                addLog(`upload error for @${char.name}: ${String(err)}`);
                              } finally {
                                setUploadingCharId(null);
                              }
                            }}
                          />

                          {(isError || hasImages) && (
                            <button
                              disabled={isGenerating || !activeProjectName}
                              onClick={async () => {
                                if (!activeProjectName || isGenerating) return;
                                setCharacterProgress(p => ({ ...p, [char.id]: 'generating' }));
                                setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Manual sync in progress...', pct: 50 } }));
                                addLog(`manual sync character: ${char.name}`);
                                try {
                                  const res = await fetch('/api/open-browser', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'char-manual-sync', projectName: activeProjectName, characterId: char.id }),
                                  });
                                  const data = await res.json();
                                  if (res.ok && data.ok) {
                                    setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Synced!', pct: 100 } }));
                                    if (Array.isArray(data.characters)) setCharacters(data.characters);
                                    setCharacterProgress(p => ({ ...p, [char.id]: 'done' }));
                                    addLog(`character synced: ${char.name}`);
                                    setTimeout(() => setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; }), 1500);
                                  } else {
                                    setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Sync failed', pct: 0 } }));
                                    setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                    addLog(`character sync failed: ${data.error}`);
                                  }
                                } catch (err) {
                                  setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                  setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; });
                                  addLog(`character sync error: ${String(err)}`);
                                }
                              }}
                              style={{
                                padding: '10px 14px', borderRadius: 10, border: '1px solid #333', flexShrink: 0,
                                background: isGenerating ? '#1a1a1a' : 'transparent',
                                color: isGenerating ? '#555' : '#ccc',
                                fontSize: 13, fontWeight: 600, cursor: isGenerating || !activeProjectName ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                              }}
                              title="Manually capture the currently visible image in AI Flow"
                            >
                              ⤓ Manual Sync
                            </button>
                          )}
                          {/* Generate button */}
                          <button
                            disabled={isGenerating || !activeProjectName}
                            onClick={async () => {
                              if (!activeProjectName || isGenerating) return;
                              setCharacterProgress(p => ({ ...p, [char.id]: 'generating' }));
                              setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Submitting prompt to AI Flow...', pct: 8 } }));
                              addLog(`generating character: ${char.name}`);
                              try {
                                // ── Call 1: Submit the prompt (fast, returns in ~15s) ──
                                const submitRes = await fetch('/api/open-browser', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'char-submit', projectName: activeProjectName, characterId: char.id }),
                                });
                                const submitData = await submitRes.json();
                                if (!submitRes.ok) {
                                  setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                  setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; });
                                  addLog(`character submit failed: ${submitData.error}`);
                                  return;
                                }
  
                                // ── Animate progress bar 25 → 85 while waiting ──
                                setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Waiting for AI Flow to generate...', pct: 25 } }));
                                let animPct = 25;
                                const animInterval = setInterval(() => {
                                  animPct = Math.min(animPct + 0.7, 85);
                                  setCharGenPhase(p => p[char.id] ? { ...p, [char.id]: { ...p[char.id], pct: animPct } } : p);
                                }, 800);
  
                                // ── Call 2: Poll until ready + download (long, up to 120s) ──
                                try {
                                  const watchRes = await fetch('/api/open-browser', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'char-watch-download', projectName: activeProjectName, characterId: char.id }),
                                  });
                                  clearInterval(animInterval);
                                  const watchData = await watchRes.json();
                                  if (watchRes.ok && watchData.ok) {
                                    setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Downloaded!', pct: 100 } }));
                                    if (Array.isArray(watchData.characters)) setCharacters(watchData.characters);
                                    setCharacterProgress(p => ({ ...p, [char.id]: 'done' }));
                                    addLog(`character ready: ${char.name} → ${watchData.imageFilename}`);
                                    setTimeout(() => setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; }), 1500);
                                  } else {
                                    setCharGenPhase(p => ({ ...p, [char.id]: { phase: 'Download failed', pct: 0 } }));
                                    setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                    addLog(`character watch failed: ${watchData.error}`);
                                  }
                                } catch (err) {
                                  clearInterval(animInterval);
                                  setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                  setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; });
                                  addLog(`character watch error: ${String(err)}`);
                                }
                              } catch (err) {
                                setCharacterProgress(p => ({ ...p, [char.id]: 'error' }));
                                setCharGenPhase(p => { const n = {...p}; delete n[char.id]; return n; });
                                addLog(`character error: ${String(err)}`);
                              }
                            }}
  
                            style={{
                              padding: '10px 20px', borderRadius: 10, border: 'none', flexShrink: 0,
                              background: isGenerating ? '#1a1a1a' : '#a78bfa',
                              color: isGenerating ? '#555' : '#fff',
                              fontSize: 13, fontWeight: 600, cursor: isGenerating || !activeProjectName ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                            }}
                          >
                            {isGenerating
                              ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Generating...</>
                              : hasImages ? '↺ Regenerate' : '✦ Generate in AI Flow'}
                          </button>
                        </div>
                      </div>

                      {/* Progress bar — shown during generation */}
                      {isGenerating && phase && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>{phase.phase}</span>
                            <span style={{ fontSize: 11, color: '#666' }}>{Math.round(phase.pct)}%</span>
                          </div>
                          <div style={{ height: 4, background: '#1a1a1a', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${phase.pct}%`, background: 'linear-gradient(90deg, #a78bfa, #7c3aed)', borderRadius: 99, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )}

                      {/* 2 variation thumbnails — click to lock as @Reference */}
                      {hasImages && !isGenerating && (
                        <div>
                          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Pick a variation to lock as @Reference
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${imagePaths.length}, 1fr)`, gap: 14, maxWidth: 440 }}>
                            {imagePaths.map((filename) => {
                              const isApproved = approvedVariation === filename;
                              return (
                                <div
                                  key={filename}
                                  onClick={async () => {
                                    const nextVariation = isApproved ? null : filename;
                                    const res = await fetch('/api/open-browser', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'approve-character', projectName: activeProjectName, characterId: char.id, variation: nextVariation }),
                                    });
                                    const d = await res.json();
                                    if (d.ok) { setCharacters(d.characters); addLog(`${isApproved ? 'unlocked' : 'locked'} @${char.name}: ${filename}`); }
                                  }}
                                  style={{
                                    position: 'relative', borderRadius: 14, overflow: 'hidden',
                                    border: `2px solid ${isApproved ? '#4ade80' : '#222'}`,
                                    cursor: 'pointer', transition: 'border-color 0.2s',
                                    background: '#000', aspectRatio: '4/3',
                                    boxShadow: isApproved ? '0 0 0 1px rgba(74,222,128,0.3)' : 'none',
                                  }}
                                >
                                  <img
                                    src={`/api/assets/${activeProjectName}/characters/${filename}?t=${Date.now()}`}
                                    alt={filename}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  />
                                  {isApproved && (
                                    <div style={{ position: 'absolute', top: 8, left: 8, background: '#4ade80', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                    </div>
                                  )}
                                  <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '2px 7px', fontSize: 10, color: '#ccc', fontFamily: 'monospace' }}>
                                    {filename}
                                  </div>
                                  
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!confirm(`Delete the image ${filename}?`)) return;
                                      const res = await fetch('/api/open-browser', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'delete-character-image', projectName: activeProjectName, characterId: char.id, imageFilename: filename })
                                      });
                                      const d = await res.json();
                                      if (d.ok) { setCharacters(d.characters); addLog(`deleted image: ${filename}`); }
                                    }}
                                    style={{
                                      position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
                                      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(248,113,113,0.8)')}
                                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
                                    title="Delete Image"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {isLocked && (
                            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#4ade80' }}>
                              ✓ <strong>{approvedVariation}</strong> will be injected as @{char.name} in grid prompts.
                            </p>
                          )}
                        </div>
                      )}

                      {/* No images yet */}
                      {!hasImages && !isGenerating && (
                        <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #1a1a1a', borderRadius: 12, color: '#444', fontSize: 13 }}>
                          Click Generate — 2 variations will be downloaded. Pick the one you want to use as @Reference.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}





          {activeTab === 'script' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, animation: 'fadeIn 0.3s ease' }}>
              <div>
                <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>Script Engine</h2>
                <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>Paste your script and send it to your selected Custom GPT for autonomous grid extraction.</p>
              </div>

              {/* GPT Selector Panel */}
              <div style={{ background: '#050505', border: '1px solid #1a1a1a', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Active Custom GPT</span>
                  <button
                    onClick={() => setShowAddGpt(v => !v)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #333', background: showAddGpt ? '#1a1a1a' : 'transparent', color: '#aaa', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
                  >
                    {showAddGpt ? '✕ Cancel' : '+ Add GPT'}
                  </button>
                </div>

                {/* Dropdown row */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select
                    value={selectedGptId}
                    onChange={async (e) => {
                      const id = e.target.value;
                      setSelectedGptId(id);
                      await fetch('/api/gpts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selectedId: id }),
                      });
                      addLog(`switched to GPT: ${id}`);
                    }}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer' }}
                  >
                    {savedGpts.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {selectedGptId !== 'default' && (
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this GPT?')) return;
                        const res = await fetch('/api/gpts', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: selectedGptId }),
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setSavedGpts(data.gpts);
                          setSelectedGptId(data.gpts[0]?.id ?? 'default');
                          addLog(`deleted GPT: ${selectedGptId}`);
                        }
                      }}
                      style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#f87171', fontSize: 13, cursor: 'pointer' }}
                    >Delete</button>
                  )}
                </div>

                {/* Selected URL preview */}
                <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {savedGpts.find(g => g.id === selectedGptId)?.url ?? ''}
                </span>

                {/* Add GPT form */}
                {showAddGpt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #1a1a1a', paddingTop: 16 }}>
                    <input
                      placeholder="GPT name (e.g. Rich Dad Story GPT)"
                      value={newGptName}
                      onChange={e => setNewGptName(e.target.value)}
                      style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 14, outline: 'none' }}
                    />
                    <input
                      placeholder="https://chatgpt.com/g/g-xxxx..."
                      value={newGptUrl}
                      onChange={e => setNewGptUrl(e.target.value)}
                      style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'monospace' }}
                    />
                    <button
                      disabled={!newGptName.trim() || !newGptUrl.trim() || savingGpt}
                      onClick={async () => {
                        setSavingGpt(true);
                        try {
                          const res = await fetch('/api/gpts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newGptName.trim(), url: newGptUrl.trim() }),
                          });
                          const data = await res.json();
                          if (data.ok) {
                            const refreshed = await fetch('/api/gpts').then(r => r.json());
                            setSavedGpts(refreshed.gpts);
                            setSelectedGptId(data.selectedId);
                            setNewGptName('');
                            setNewGptUrl('');
                            setShowAddGpt(false);
                            addLog(`added GPT: ${data.gpt.name}`);
                          } else {
                            alert('Error: ' + data.error);
                          }
                        } finally {
                          setSavingGpt(false);
                        }
                      }}
                      style={{ padding: '12px', borderRadius: 10, border: 'none', background: newGptName.trim() && newGptUrl.trim() ? '#a78bfa' : '#1a1a1a', color: newGptName.trim() && newGptUrl.trim() ? '#fff' : '#555', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {savingGpt ? 'Saving...' : 'Save & Select'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 32 }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: '0', fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{hasGptConversation ? 'Accumulated Script History' : 'Initial Script'}</h3>
                    <span style={{ fontSize: 12, color: '#555' }}>{scriptText.trim().length} chars</span>
                  </div>
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    style={{ flex: hasGptConversation ? '0 0 auto' : 1, minHeight: hasGptConversation ? 220 : 400, resize: 'vertical', padding: '20px', borderRadius: 16, border: '1px solid #222', background: '#050505', color: '#fff', fontSize: 14, lineHeight: 1.6, outline: 'none', fontFamily: 'monospace' }}
                    placeholder="Enter full script context here..."
                  />
                  {!hasGptConversation && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={handleSendToGPT}
                        disabled={isSending || !scriptText.trim()}
                        style={{ flex: 1, padding: '16px', borderRadius: 12, border: 'none', background: isSending ? '#222' : '#fff', color: isSending ? '#888' : '#000', fontSize: 15, fontWeight: 600, cursor: isSending || !scriptText.trim() ? 'not-allowed' : 'pointer', textAlign: 'center' }}
                      >
                        {isSending ? 'Processing with GPT...' : 'Process Script →'}
                      </button>
                      {!browserOpen && <button onClick={handleOpenChatGPT} style={{ padding: '16px', borderRadius: 12, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Open Browser</button>}
                    </div>
                  )}
                  
                  {hasGptConversation && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <h3 style={{ margin: '0', fontSize: 12, fontWeight: 600, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1 }}>Next Story Part / Draft</h3>
                      </div>
                      <textarea
                         value={followUpText}
                         onChange={(e) => setFollowUpText(e.target.value)}
                         style={{ flex: 1, minHeight: 160, resize: 'vertical', padding: '16px', borderRadius: 16, border: '1px solid #2a1a4a', background: 'rgba(167, 139, 250, 0.03)', color: '#fff', fontSize: 14, lineHeight: 1.6, outline: 'none', fontFamily: 'monospace' }}
                         placeholder="Enter the next part of your story... It will be appended to the history above upon sending."
                      />
                      <button
                         onClick={handleFollowUpToGPT}
                         disabled={isSending || !followUpText.trim()}
                         style={{ padding: '14px', borderRadius: 12, border: '1px solid #2a1a4a', background: isSending ? '#111' : 'rgba(167, 139, 250, 0.1)', color: isSending ? '#888' : '#a78bfa', fontSize: 14, fontWeight: 600, cursor: isSending || !followUpText.trim() ? 'not-allowed' : 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
                      >
                         {isSending ? 'Sending next part...' : 'Submit Part 2 To GPT →'}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: '0', fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>GPT Output</h3>
                    <span style={{ fontSize: 12, color: '#555' }}>{gptResponse ? 'Success' : 'Await Input'}</span>
                  </div>
                  <div style={{ flex: 1, minHeight: 400, whiteSpace: 'pre-wrap', padding: '20px', borderRadius: 16, border: '1px solid #1a1a1a', background: '#080808', color: gptResponse ? '#e5e5e5' : '#444', fontSize: 14, lineHeight: 1.6, overflow: 'auto', fontFamily: 'monospace' }}>
                    {gptResponse || "The extracted grid definitions will appear here..."}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'grids' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>Grid Foundry</h2>
                  <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>Review individual extracted grids, modify parameters, and approve them for bulk image generation.</p>

                  {/* ── Stats row ── */}
                  {(() => {
                    const totalGrids   = gridBlocks.length;
                    const approved     = approvedGridIndexes.length;
                    const created      = approvedGridIndexes.filter(i => generatedGrids.includes(i)).length;
                    const pending      = approved - created;
                    return totalGrids > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Total</span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{totalGrids}</span>
                        </div>
                        <div style={{ width: 1, height: 12, background: '#222' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Approved</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{approved}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Created</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{created}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>To generate</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: pending > 0 ? '#a78bfa' : '#555' }}>{pending}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                  {/* Generate All — shows exact pending count */}
                  {(() => {
                    const pendingToGenerate = approvedGridIndexes.filter(i => !generatedGrids.includes(i)).length;
                    const hasWork = pendingToGenerate > 0;
                    const isDisabled = generatingAllGrids || !!generatingProgress || !hasWork;
                    return (
                      <>
                        <button
                          onClick={handleGenerateAllGrids}
                          disabled={isDisabled}
                          style={{
                            padding: '14px 24px', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            background: generatingAllGrids ? '#1a1a1a' : hasWork ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1a1a1a',
                            color: isDisabled ? '#555' : '#fff',
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: isDisabled ? 'none' : '0 0 20px rgba(99,102,241,0.3)',
                            transition: 'all 0.2s',
                          }}
                        >
                          {generatingAllGrids && generatingAllQueue ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                              Grid {generatingAllQueue.currentGridIndex + 1} &nbsp;·&nbsp; {generatingAllQueue.current}/{generatingAllQueue.total}
                            </>
                          ) : hasWork ? (
                            <>⚡ Generate All <span style={{ opacity: 0.7, fontSize: 12 }}>({pendingToGenerate} pending)</span></>
                          ) : (
                            <>✓ All grids created</>
                          )}
                        </button>

                        {generatingAllGrids && generatingAllQueue && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 220 }}>
                            <div style={{ height: 4, background: '#111', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                                width: `${Math.round((generatingAllQueue.current / generatingAllQueue.total) * 100)}%`,
                                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#555', textAlign: 'right' }}>
                              {generatingAllQueue.current} of {generatingAllQueue.total} grids
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32 }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3 style={{ margin: '0', fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Extracted Sequence</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflow: 'auto', paddingRight: 8 }}>
                    {gridBlocks.length === 0 && <div style={{ color: '#555', fontSize: 14, fontStyle: 'italic' }}>No grids loaded.</div>}
                    {gridBlocks.map((_, index) => {
                      const isApproved = gridApprovals[index];
                      const isSelected = index === selectedGridIndex;
                      const isCurrentlyGenerating = generatingAllGrids && generatingAllQueue?.currentGridIndex === index;
                      const isCreated = generatedGrids.includes(index);
                      return (
                        <button
                          key={index}
                          onClick={() => handleSelectGrid(index)}
                          style={{
                            textAlign: 'left', padding: '14px 16px', borderRadius: 12, border: '1px solid',
                            borderColor: isCurrentlyGenerating ? '#6366f1' : isCreated ? '#22c55e33' : isSelected ? '#444' : '#1a1a1a',
                            background: isCurrentlyGenerating ? 'rgba(99,102,241,0.08)' : isCreated && !isSelected ? 'rgba(34,197,94,0.04)' : isSelected ? '#111' : '#050505',
                            color: isApproved ? '#fff' : '#aaa',
                            cursor: 'pointer', transition: 'all 0.15s ease', fontSize: 14,
                            fontWeight: isSelected ? 500 : 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>Grid {index + 1}</span>
                            {isCreated && (
                              <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, letterSpacing: 0.5 }}>
                                ✓ created
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isCurrentlyGenerating && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                            )}
                            {isApproved && !isCurrentlyGenerating && <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 10, fontWeight: 'bold' }}>✓</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: '0', fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Raw Configuration</h3>
                    {selectedGridDirty && <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 500, background: 'rgba(251, 191, 36, 0.1)', padding: '4px 8px', borderRadius: 6 }}>Unsaved Edits</span>}
                  </div>

                  <textarea
                    value={selectedGridText}
                    onChange={(e) => handleEditGridText(e.target.value)}
                    style={{ flex: 1, minHeight: 450, resize: 'vertical', padding: '24px', borderRadius: 16, border: '1px solid #222', background: '#050505', color: '#e5e5e5', fontSize: 14, lineHeight: 1.7, outline: 'none', fontFamily: 'monospace' }}
                    placeholder="Select a grid to preview and edit..."
                  />

                  {/* Progress bar — shown while generating */}
                  {generatingProgress && generatingProgress.gridIndex === selectedGridIndex && (
                    <div style={{ width: '100%', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#aaa', fontWeight: 500 }}>{generatingProgress.phase}</span>
                        <span style={{ fontSize: 12, color: generatingProgress.pct === 100 ? '#4ade80' : '#888', fontWeight: 600 }}>{Math.round(generatingProgress.pct)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#111', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${generatingProgress.pct}%`, background: generatingProgress.pct === 100 ? 'linear-gradient(90deg, #4ade80, #22c55e)' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 99, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px', background: '#050505', borderRadius: 16, border: '1px solid #1a1a1a' }}>
                    <button
                      onClick={handleSaveGrid}
                      disabled={selectedGridSaving || !selectedGridDirty}
                      style={{ padding: '12px 24px', borderRadius: 8, border: '1px solid #333', background: selectedGridDirty ? '#fff' : '#111', color: selectedGridDirty ? '#000' : '#666', fontSize: 14, fontWeight: 600, cursor: selectedGridDirty ? 'pointer' : 'not-allowed' }}
                    >
                      {selectedGridSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    {!gridApprovals[selectedGridIndex] ? (
                      <button
                        onClick={() => handleApproveGrid(true)}
                        disabled={selectedGridApproving || !activeProjectName}
                        style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 600, cursor: activeProjectName ? 'pointer' : 'not-allowed' }}
                      >
                        Approve for Generation
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApproveGrid(false)}
                        disabled={selectedGridApproving}
                        style={{ padding: '12px 24px', borderRadius: 8, border: '1px solid #ef444455', background: '#ef444422', color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Revoke Approval
                      </button>
                    )}

                    <div style={{ width: 1, height: 24, background: '#222', margin: '0 8px' }} />

                    {/* Single automated button replaces the 3-step manual flow */}
                    <button
                      onClick={handleGenerateImages}
                      disabled={!!generatingProgress || !activeProjectName || !gridApprovals[selectedGridIndex]}
                      style={{ padding: '12px 28px', borderRadius: 8, border: 'none', background: generatingProgress ? '#1a1a1a' : '#3b82f6', color: generatingProgress ? '#666' : '#fff', fontSize: 14, fontWeight: 600, cursor: generatingProgress ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                    >
                      {generatingProgress && generatingProgress.gridIndex === selectedGridIndex ? (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Generating...</>
                      ) : '⚡ Generate & Auto-Download'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'grid-assets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>Grid Assets</h2>
                    <button
                      onClick={async () => {
                        if (!activeProjectName) return;
                        const r = await fetch('/api/open-browser');
                        if (r.ok) {
                          const d = await r.json();
                          if (d.extractedShots) setExtractedShots(d.extractedShots);
                          if (d.projectGridImages) setProjectGridImages(d.projectGridImages);
                        }
                      }}
                      title="Refresh counts from disk"
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: '#111', color: '#888', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                      Refresh
                    </button>
                  </div>
                  <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                    Assign shots from each grid variation, then Extract All. Files saved as <code style={{ color: '#a78bfa', fontSize: 12 }}>grid1_1.png … grid18_9.png</code>
                  </p>

                  {/* Stats row */}
                  {(() => {
                    const totalWithImages = gridBlocks.filter((_, i) => {
                      const s = `Grid ${i + 1}`; const o = `Grid-${i + 1}`;
                      return projectGridImages.some(f => f.includes(o) || f.startsWith(s + '.') || f.startsWith(s + ' '));
                    }).length;
                    const extractedCount = gridBlocks.filter((_, i) => (extractedShots[i] ?? []).length >= 9).length;
                    const pendingExtract = totalWithImages - extractedCount;
                    return totalWithImages > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>With images</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{totalWithImages}</span>
                        </div>
                        <div style={{ width: 1, height: 12, background: '#222' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Extracted</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fb923c' }}>{extractedCount}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>To extract</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: pendingExtract > 0 ? '#38bdf8' : '#555' }}>{pendingExtract}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* ── Extract All panel (shot count + delay + button) ── */}
                {(() => {
                  // For each grid with assignments, count only slots NOT yet on disk
                  const assignedGrids = gridBlocks.reduce<{ gridIdx: number; approvedFile: string; remainingCount: number; totalCount: number }[]>((acc, _, i) => {
                    const assigned = shotAssignments[i] ?? {};
                    const totalCount = Object.keys(assigned).length;
                    if (totalCount === 0) return acc; // skip grids with no selections at all
                    const s = `Grid ${i + 1}`; const o = `Grid-${i + 1}`;
                    const imgs = projectGridImages.filter(f => f.includes(o) || f.startsWith(s + '.') || f.startsWith(s + ' '));
                    const approvedFile = imageApprovals[String(i)] ?? imageApprovals[i as any] ?? imgs[0];
                    // Count slots whose file is NOT yet on disk
                    const extractedFilenames = new Set(extractedShots[i] ?? []);
                    const remainingCount = Object.keys(assigned).filter(slot => {
                      const key = `grid${i + 1}_${slot}.png`;
                      return !extractedFilenames.has(key);
                    }).length;
                    if (approvedFile) acc.push({ gridIdx: i, approvedFile, remainingCount, totalCount });
                    return acc;
                  }, []);
                  const totalRemainingShots = assignedGrids.reduce((s, g) => s + g.remainingCount, 0);
                  const totalAssignedShots = assignedGrids.reduce((s, g) => s + g.totalCount, 0);
                  const gridsWithWork = assignedGrids.filter(g => g.remainingCount > 0);
                  const hasWork = gridsWithWork.length > 0;
                  const isDisabled = extractingAll || !hasWork;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>

                      {/* Shot count summary */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: hasWork ? '#fb923c' : '#4ade80', lineHeight: 1 }}>
                          {totalRemainingShots}
                        </div>
                        <div style={{ fontSize: 11, color: '#555', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          shots remaining
                        </div>
                        <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
                          {totalAssignedShots - totalRemainingShots}/{totalAssignedShots} already done
                        </div>
                      </div>

                      {/* Delay controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#050505', border: '1px solid #1a1a1a', borderRadius: 10, padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Delay</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{ fontSize: 11, color: '#666' }}>Min</label>
                          <input
                            type="number" min={1} max={maxExtDelay} value={minExtDelay}
                            onChange={e => setMinExtDelay(Math.max(1, Math.min(Number(e.target.value), maxExtDelay)))}
                            style={{ width: 48, padding: '5px 6px', borderRadius: 6, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 13, outline: 'none', textAlign: 'center' }}
                          />
                        </div>
                        <span style={{ color: '#444', fontSize: 12 }}>–</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{ fontSize: 11, color: '#666' }}>Max</label>
                          <input
                            type="number" min={minExtDelay} max={120} value={maxExtDelay}
                            onChange={e => setMaxExtDelay(Math.max(minExtDelay, Math.min(Number(e.target.value), 120)))}
                            style={{ width: 48, padding: '5px 6px', borderRadius: 6, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 13, outline: 'none', textAlign: 'center' }}
                          />
                        </div>
                        <span style={{ fontSize: 10, color: '#555' }}>{minExtDelay}s–{maxExtDelay}s</span>
                      </div>

                      {/* Extract All button */}
                      <button
                        onClick={handleExtractAll}
                        disabled={isDisabled}
                        style={{
                          padding: '14px 24px', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          background: extractingAll ? '#1a1a1a' : hasWork ? 'linear-gradient(135deg, #fb923c, #f97316)' : '#1a1a1a',
                          color: isDisabled ? '#555' : '#fff',
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center',
                          boxShadow: isDisabled ? 'none' : '0 0 20px rgba(251,146,60,0.3)',
                          transition: 'all 0.2s',
                        }}
                      >
                        {extractingAll && extractingAllQueue ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                            Grid {extractingAllQueue.currentGridIndex + 1} &nbsp;·&nbsp; {extractingAllQueue.current}/{extractingAllQueue.total}
                          </>
                        ) : hasWork ? (
                          <>✂️ Extract All  <span style={{ opacity: 0.7, fontSize: 12 }}>({totalRemainingShots} remaining)</span></>
                        ) : (
                          <>✓ All done — {totalAssignedShots} shots extracted</>
                        )}
                      </button>

                      {/* Queue progress bar */}
                      {extractingAll && extractingAllQueue && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                          <div style={{ height: 4, background: '#111', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                              width: `${Math.round((extractingAllQueue.current / extractingAllQueue.total) * 100)}%`,
                              background: 'linear-gradient(90deg, #fb923c, #f97316)',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#555', textAlign: 'right' }}>
                            Grid {extractingAllQueue.currentGridIndex + 1} &nbsp;·&nbsp; {extractingAllQueue.current} of {extractingAllQueue.total} grids
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {gridBlocks.length === 0 ? (
                <div style={{ padding: 80, textAlign: 'center', background: '#050505', border: '1px border-dashed #1a1a1a', borderRadius: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🖼️</div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>No grids available yet</h3>
                  <p style={{ margin: 0, color: '#444', fontSize: 14 }}>Go to Grid Foundry to generate and download blocks.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                  {gridBlocks.map((_, gridIdx) => {
                    const gridStrOld = `Grid-${gridIdx + 1}`;
                    const gridStrNew = `Grid ${gridIdx + 1}`;
                    // We match if the filename starts with the exact grid base name
                    const theseImages = projectGridImages.filter(f =>
                      f.includes(gridStrOld) || (f.startsWith(gridStrNew + '.') || f.startsWith(gridStrNew + ' '))
                    );

                    // Compute per-grid values for shot assignment
                    const gridAssignments = shotAssignments[gridIdx] ?? {};
                    const approvedFile = imageApprovals[String(gridIdx)] ?? imageApprovals[gridIdx as any] ?? theseImages[0];
                    const assignedSlotsCount = Object.keys(gridAssignments).length;

                    const buildExtractionPayload = () =>
                      Array.from({ length: 9 }, (_, i) => i + 1).map(slot => ({
                        shotIndex: slot,
                        filename: gridAssignments[slot] ?? approvedFile,
                      }));

                    return (
                      <div key={gridIdx} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Grid Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 16, color: '#fff', fontWeight: 600 }}>Grid {gridIdx + 1}</h3>
                          <div style={{ height: 1, background: '#222', flex: 1 }} />
                          {assignedSlotsCount > 0 && (
                            <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, padding: '3px 8px', background: 'rgba(167,139,250,0.1)', borderRadius: 6, border: '1px solid rgba(167,139,250,0.2)' }}>
                              {assignedSlotsCount}/9 shots assigned
                            </span>
                          )}
                          {/* Direct Extract Button */}
                          {approvedFile && (
                            <button
                              onClick={async () => {
                                setStatus('Opening Grok...');
                                addLog(`Extracting Grid ${gridIdx + 1}${assignedSlotsCount > 0 ? ' with custom shot sources' : ' (all 9)'}`);
                                const payload: Record<string, unknown> = {
                                  action: 'extract-shot',
                                  gridIndex: gridIdx,
                                  filename: approvedFile,
                                  projectName: activeProjectName,
                                  minDelay: minExtDelay,
                                  maxDelay: maxExtDelay,
                                };
                                if (assignedSlotsCount > 0) {
                                  payload.shotAssignments = buildExtractionPayload();
                                }
                                const res = await fetch('/api/open-browser', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload),
                                });
                                if (res.ok) {
                                  setStatus('Extraction complete');
                                  addLog('Extraction done. Opening folder...');
                                  setViewingExtracted(gridIdx);
                                  setActiveTab('extraction');
                                  fetch('/api/open-browser').then(r => r.json()).then(d => {
                                    if (d.extractedShots) setExtractedShots(d.extractedShots);
                                  });
                                } else {
                                  setStatus('Extraction failed');
                                  addLog('Extraction failed');
                                }
                              }}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: assignedSlotsCount > 0 ? '#a78bfa' : '#3b82f6',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                              }}
                              title={assignedSlotsCount > 0 ? 'Extract using your shot selections' : 'Extract all 9 shots from approved file'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                              {assignedSlotsCount > 0 ? 'Extract Selection' : 'Extract 9 Shots'}
                            </button>
                          )}
                        </div>

                        {theseImages.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', border: '1px dashed #222', borderRadius: 16, background: '#050505' }}>
                            <p style={{ margin: 0, color: '#555', fontSize: 13 }}>No downloaded images for Grid {gridIdx + 1}.</p>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            {theseImages.map((filename, idx) => {
                              const isApproved = (imageApprovals[String(gridIdx)] ?? imageApprovals[gridIdx as any]) === filename;
                              const claimedSlots = Array.from({ length: 9 }, (_, i) => i + 1)
                                .filter(slot => gridAssignments[slot] === filename);
                              const claimedCount = claimedSlots.length;

                              return (
                                <div className="image-card" key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 0, background: '#050505', border: claimedCount > 0 ? '1px solid rgba(167,139,250,0.4)' : '1px solid #1a1a1a', borderRadius: 20, overflow: 'hidden', transition: 'all 0.2s ease' }}>
                                  <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
                                    <img
                                      src={`/api/assets/${activeProjectName}/grids/${filename}`}
                                      alt={filename}
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                    {claimedCount > 0 && (
                                      <div style={{ position: 'absolute', top: 12, left: 12, padding: '3px 8px', background: 'rgba(167,139,250,0.85)', backdropFilter: 'blur(6px)', borderRadius: 6, fontSize: 10, color: '#fff', fontWeight: 700 }}>
                                        {claimedCount} shot{claimedCount > 1 ? 's' : ''} claimed
                                      </div>
                                    )}
                                    <div style={{ position: 'absolute', top: 12, right: 12, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 6, fontSize: 10, color: '#fff' }}>
                                      Var {idx + 1}
                                    </div>
                                    <button
                                      className="expand-btn"
                                      onClick={() => setEnlargedImage(`/api/assets/${activeProjectName}/grids/${filename}`)}
                                      style={{ position: 'absolute', bottom: 12, right: 12, padding: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 8, color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                      title="Expand Image"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                                    </button>
                                  </div>

                                  {/* Shot assignment row */}
                                  <div style={{ padding: '10px 14px', background: '#0a0a0a', borderTop: '1px solid #111' }}>
                                    <div style={{ fontSize: 10, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                                      Assign Shots → <span style={{ color: '#a78bfa' }}>{filename}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      {Array.from({ length: 9 }, (_, i) => i + 1).map(slot => {
                                        const isAssignedHere = gridAssignments[slot] === filename;
                                        const isAssignedElsewhere = !isAssignedHere && gridAssignments[slot] !== undefined;
                                        return (
                                          <button
                                            key={slot}
                                            onClick={() => handleToggleShotAssignment(gridIdx, slot, filename)}
                                            title={isAssignedHere ? `Remove Shot ${slot}` : isAssignedElsewhere ? `Move Shot ${slot} here` : `Assign Shot ${slot} to this variation`}
                                            style={{
                                              width: 32, height: 32, borderRadius: 6,
                                              border: isAssignedHere ? '2px solid #a78bfa' : isAssignedElsewhere ? '1px solid #333' : '1px solid #2a2a2a',
                                              background: isAssignedHere ? 'rgba(167,139,250,0.2)' : isAssignedElsewhere ? '#0d0d0d' : '#111',
                                              color: isAssignedHere ? '#a78bfa' : isAssignedElsewhere ? '#333' : '#666',
                                              fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                              opacity: isAssignedElsewhere ? 0.4 : 1,
                                            }}
                                          >
                                            {slot}
                                          </button>
                                        );
                                      })}
                                      {claimedCount > 0 && (
                                        <button
                                          onClick={() => {
                                            setShotAssignments(prev => {
                                              const gridMap = { ...(prev[gridIdx] ?? {}) };
                                              claimedSlots.forEach(s => delete gridMap[s]);
                                              const next = { ...prev, [gridIdx]: gridMap };
                                              handleSaveShotAssignments(next);
                                              return next;
                                            });
                                          }}
                                          style={{ marginLeft: 4, padding: '0 8px', height: 32, borderRadius: 6, border: '1px solid #2a2a2a', background: 'transparent', color: '#555', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}
                                        >
                                          ✕ Clear
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bottom row: filename + delete */}
                                  <div style={{ padding: '12px 14px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ fontSize: 12, color: '#555', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename}</div>
                                    <button onClick={() => handleDeleteGridImage(filename)} style={{ width: 34, padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Delete Image">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          {activeTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>System Logs</h2>
                  <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>Live event and API execution trace for the automation pipeline.</p>
                </div>
                <div style={{ padding: '8px 16px', background: '#1a1a1a', color: '#888', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
                  {logs.length} Events
                </div>
              </div>
              <div style={{ background: '#050505', border: '1px solid #1a1a1a', borderRadius: 16, padding: '24px 32px', minHeight: 400, maxHeight: 600, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {logs.map((line, i) => (
                  <div key={i} style={{ fontSize: 13, fontFamily: 'monospace', color: '#aaa', lineHeight: 1.6 }}>
                    <span style={{ color: '#444', marginRight: 16 }}>[{String(i).padStart(3, '0')}]</span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'extraction' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>Extraction Flow</h2>
                  <p style={{ margin: 0, color: '#888', fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>Launch Grok to extract your assigned shots into final images.</p>

                  {/* Stats row */}
                  {(() => {
                    const assignedGridCount = Object.keys(shotAssignments).length;
                    const totalShotsExtracted = Object.values(extractedShots).reduce((s, arr) => s + arr.length, 0);
                    const extractedGridCount = Object.keys(extractedShots).length;
                    const pendingGrids = assignedGridCount - extractedGridCount;
                    return assignedGridCount > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Assigned grids</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{assignedGridCount}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Shots extracted</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fb923c' }}>{totalShotsExtracted}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                          <span style={{ fontSize: 12, color: '#aaa' }}>Grids remaining</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: pendingGrids > 0 ? '#38bdf8' : '#555' }}>{pendingGrids}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
                  {/* ── Extract All button ── */}
                  {(() => {
                    const pendingExtract = Object.keys(shotAssignments).filter(
                      k => (extractedShots[Number(k)] ?? []).length < Object.keys(shotAssignments[Number(k)] ?? {}).length
                    ).length;
                    const hasWork = pendingExtract > 0;
                    const isDisabled = extractingAll || !hasWork;
                    return (
                      <>
                        <button
                          onClick={handleExtractAll}
                          disabled={isDisabled}
                          style={{
                            padding: '14px 28px', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            background: extractingAll ? '#1a1a1a' : hasWork ? 'linear-gradient(135deg, #fb923c, #f97316)' : '#1a1a1a',
                            color: isDisabled ? '#555' : '#fff',
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: isDisabled ? 'none' : '0 0 24px rgba(251,146,60,0.35)',
                            transition: 'all 0.2s',
                          }}
                        >
                          {extractingAll && extractingAllQueue ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                              Grid {extractingAllQueue.currentGridIndex + 1} &nbsp;·&nbsp; {extractingAllQueue.current}/{extractingAllQueue.total}
                            </>
                          ) : hasWork ? (
                            <>✂️ Extract All <span style={{ opacity: 0.7, fontSize: 12 }}>({pendingExtract} pending)</span></>
                          ) : (
                            <>✓ All shots extracted</>
                          )}
                        </button>

                        {extractingAll && extractingAllQueue && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 220 }}>
                            <div style={{ height: 4, background: '#111', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                                width: `${Math.round((extractingAllQueue.current / extractingAllQueue.total) * 100)}%`,
                                background: 'linear-gradient(90deg, #fb923c, #f97316)',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#555', textAlign: 'right' }}>
                              {extractingAllQueue.current} of {extractingAllQueue.total} grids
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Shot delay controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#050505', border: '1px solid #1a1a1a', borderRadius: 14, padding: '14px 20px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Shot Delay</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Min&nbsp;(s)</label>
                      <input
                        id="min-ext-delay"
                        type="number"
                        min={1}
                        max={maxExtDelay}
                        value={minExtDelay}
                        onChange={e => setMinExtDelay(Math.max(1, Math.min(Number(e.target.value), maxExtDelay)))}
                        style={{ width: 60, padding: '7px 10px', borderRadius: 8, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 14, outline: 'none', textAlign: 'center' }}
                      />
                    </div>
                    <span style={{ color: '#444' }}>–</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Max&nbsp;(s)</label>
                      <input
                        id="max-ext-delay"
                        type="number"
                        min={minExtDelay}
                        max={120}
                        value={maxExtDelay}
                        onChange={e => setMaxExtDelay(Math.max(minExtDelay, Math.min(Number(e.target.value), 120)))}
                        style={{ width: 60, padding: '7px 10px', borderRadius: 8, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 14, outline: 'none', textAlign: 'center' }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>{minExtDelay}s – {maxExtDelay}s</span>
                  </div>
                </div>
              </div>

              {Object.keys(shotAssignments).length === 0 && Object.keys(extractedShots).length === 0 ? (
                <div style={{ padding: 80, textAlign: 'center', background: '#050505', border: '1px dashed #1a1a1a', borderRadius: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>No shots assigned yet</h3>
                  <p style={{ color: '#555', margin: 0 }}>Go to Grid Assets, assign slot buttons, then come back to extract.</p>
                </div>
              ) : viewingExtracted !== null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                    <button
                      onClick={() => setViewingExtracted(null)}
                      style={{ padding: '10px 16px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontWeight: 'bold' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                      Back to Grid Folders
                    </button>
                    <h2 style={{ margin: 0, color: '#fff' }}>Extracted Components (Grid {(viewingExtracted as number) + 1})</h2>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {extractedShots[viewingExtracted as number]?.map((shotFile: string) => (
                      <div className="image-card" key={shotFile} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#050505', border: '1px solid #1a1a1a', borderRadius: 20, overflow: 'hidden' }}>
                        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
                          <img
                            key={shotFile}
                            src={`/api/assets/${activeProjectName}/extracted/${shotFile}?t=${lastTick}`}
                            alt={shotFile}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'all 0.3s ease' }}
                          />
                          <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 8px', background: '#a855f7', borderRadius: 6, fontSize: 10, color: '#fff', fontWeight: 'bold' }}>
                            {shotFile}
                          </div>
                          <button
                            className="expand-btn"
                            onClick={() => setEnlargedImage(`/api/assets/${activeProjectName}/extracted/${shotFile}`)}
                            style={{ position: 'absolute', bottom: 12, right: 12, padding: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 8, color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                            title="Expand Image"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                          </button>
                        </div>
                        <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ fontSize: 13, color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Saved as: <strong style={{ color: '#fff' }}>{shotFile}</strong></span>
                            {shotSources[shotFile.split('.')[0]] ? (
                              <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Memory Linked</span>
                            ) : (
                              <span style={{ fontSize: 10, color: '#666' }}>No source link</span>
                            )}
                          </div>

                          <button
                            onClick={() => handleEditShot(shotFile.split('.')[0], shotSources[shotFile.split('.')[0]])}
                            disabled={!shotSources[shotFile.split('.')[0]] || editingShot === shotFile.split('.')[0]}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: 10,
                              border: '1px solid #1a1a1a',
                              background: editingShot === shotFile.split('.')[0] ? '#111' : shotSources[shotFile.split('.')[0]] ? 'rgba(59, 130, 246, 0.1)' : '#050505',
                              color: shotSources[shotFile.split('.')[0]] ? '#3b82f6' : '#444',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: shotSources[shotFile.split('.')[0]] ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              transition: 'all 0.2s'
                            }}
                          >
                            {editingShot === shotFile.split('.')[0] ? (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Updating...</>
                            ) : (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit Shot Prompt</>
                            )}
                          </button>
                          {shotSources[shotFile.split('.')[0]] && (
                            <button
                              onClick={() => handleRedownloadShot(shotFile.split('.')[0], shotSources[shotFile.split('.')[0]])}
                              disabled={editingShot === shotFile.split('.')[0]}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: 10,
                                border: '1px solid #1a1a1a',
                                background: '#111',
                                color: '#aaa',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                transition: 'all 0.2s'
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                              Redownload
                            </button>
                          )}
                          {/* Regenerate Shot button — re-extracts just this one shot from Grok */}
                          {(() => {
                            const shotId = shotFile.split('.')[0]; // e.g. "grid2_6" or legacy "19"
                            const gridIdx = viewingExtracted as number;
                            // Parse new format grid{N}_{slot}.png
                            const newFmt = shotId.match(/^grid(\d+)_(\d+)$/i);
                            const slotWithinGrid = newFmt
                              ? Number(newFmt[2])
                              : ((Number(shotId) - 1) % 9) + 1; // legacy fallback
                            // Resolve source image from shotAssignments
                            const assignedFilename =
                              shotAssignments[gridIdx]?.[slotWithinGrid] ??
                              projectGridImages.find(f => {
                                const gs = `Grid ${gridIdx + 1}`;
                                return f.startsWith(gs + '.') || f.startsWith(gs + ' ');
                              });
                            const isRegenerating = regeneratingShot === shotId;
                            return (
                              <button
                                onClick={async () => {
                                  if (!assignedFilename || !activeProjectName) return;
                                  setRegeneratingShot(shotId);
                                  addLog(`Re-extracting photo for shot ${shotId} (grid ${gridIdx + 1}, slot ${slotWithinGrid}) from image: ${assignedFilename}`);
                                  try {
                                    const res = await fetch('/api/open-browser', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        action: 'extract-shot',          // ← re-extracts the PHOTO, not video
                                        gridIndex: gridIdx,
                                        filename: assignedFilename,      // source grid image
                                        projectName: activeProjectName,
                                        minDelay: minExtDelay,
                                        maxDelay: maxExtDelay,
                                        // Only re-run this single slot
                                        shotAssignments: [{ shotIndex: slotWithinGrid, filename: assignedFilename }],
                                      }),
                                    });
                                    if (res.ok) {
                                      addLog(`Shot ${shotId} photo re-extracted successfully`);
                                      setLastTick(Date.now());
                                      fetch('/api/open-browser').then(r => r.json()).then(d => {
                                        if (d.extractedShots) setExtractedShots(d.extractedShots);
                                        if (d.shotSources) setShotSources(d.shotSources);
                                      });
                                    } else {
                                      const errData = await res.json().catch(() => ({}));
                                      addLog(`Shot ${shotId} re-extraction failed: ${errData.error ?? 'unknown error'}`);
                                    }
                                  } finally {
                                    setRegeneratingShot(null);
                                  }
                                }}
                                disabled={isRegenerating || !assignedFilename}
                                title={assignedFilename ? `Re-extract photo for slot ${slotWithinGrid} from grid image: ${assignedFilename}` : 'No approved grid image found — approve one in Grid Assets first'}
                                style={{
                                  width: '100%',
                                  padding: '8px',
                                  borderRadius: 10,
                                  border: '1px solid rgba(251,191,36,0.25)',
                                  background: isRegenerating ? '#111' : 'rgba(251,191,36,0.06)',
                                  color: isRegenerating ? '#555' : '#fbbf24',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: isRegenerating || !assignedFilename ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  transition: 'all 0.2s',
                                  opacity: !assignedFilename ? 0.4 : 1,
                                }}
                              >
                                {isRegenerating ? (
                                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Re-Extracting Photo...</>
                                ) : (
                                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg> 📷 Regenerate Photo</>  
                                )}
                              </button>
                            );
                          })()}
                          <button
                            onClick={() => {
                              const shotId = shotFile.split('.')[0];
                              const gridIdx = viewingExtracted as number;
                              const newFmt2 = shotId.match(/^grid(\d+)_(\d+)$/i);
                              const slot = newFmt2
                                ? Number(newFmt2[2])
                                : ((Number(shotId) - 1) % 9) + 1; // legacy fallback
                              const desc = gridDescriptions[gridIdx];
                              
                              // Compose full prompt: Style + Setting + Shot Description
                              let fullPrompt = '';
                              if (desc) {
                                if (desc.style) fullPrompt += `Style:\n${desc.style}\n\n`;
                                if (desc.setting) fullPrompt += `Setting:\n${desc.setting}\n\n`;
                                if (desc.shots[slot]) fullPrompt += `Action:\n${desc.shots[slot]}\n\n`;
                              }
                              fullPrompt += "Make this into a cinematic video with smooth motion.";

                              setTweakingVideoShot({ gridIdx, shotId, prompt: fullPrompt });
                            }}
                            disabled={generatingVideoShot === shotFile.split('.')[0]}
                            style={{
                              width: '100%',
                              padding: '8px',
                              borderRadius: 10,
                              border: '1px solid rgba(168,85,247,0.25)',
                              background: generatingVideoShot === shotFile.split('.')[0] ? '#111' : 'rgba(168,85,247,0.06)',
                              color: generatingVideoShot === shotFile.split('.')[0] ? '#555' : '#a855f7',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: generatingVideoShot === shotFile.split('.')[0] ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              transition: 'all 0.2s'
                            }}
                          >
                            {generatingVideoShot === shotFile.split('.')[0] ? (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Generating video...</>
                            ) : (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></svg> Generate Video</>
                            )}
                          </button>
                        </div>
                        </div>
                      ))}
                    </div>
                  </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                  {Array.from(new Set([
                    ...Object.keys(shotAssignments).map(Number),
                    ...Object.keys(extractedShots).map(Number),
                  ])).sort((a, b) => a - b)
                    .map((gridIdx) => {
                      // Available images for this grid
                      const gridStrNew = `Grid ${gridIdx + 1}`;
                      const availableImages = projectGridImages.filter(f =>
                        f.startsWith(gridStrNew + '.') || f.startsWith(gridStrNew + ' ')
                      );

                      // Current assignments for this grid
                      const gridAssignments: Record<number, string> = shotAssignments[gridIdx] ?? {};

                      // Preview image: first assigned file, or first available grid image
                      const firstAssigned = Object.values(gridAssignments)[0] ?? availableImages[0] ?? '';
                      const filename = firstAssigned;

                      // All slots assigned (could be all same image or mixed)
                      const hasCustomAssignments = Object.keys(gridAssignments).length > 0;
                      const buildAssignmentsPayload = () =>
                        Object.entries(gridAssignments).map(([slot, fn]) => ({
                          shotIndex: Number(slot),
                          filename: fn,
                        }));

                      const isConfigOpen = configGridIdx === gridIdx;

                      return (
                        <div className="image-card" key={gridIdx} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#050505', border: '1px solid #1a1a1a', borderRadius: 20, overflow: 'hidden' }}>
                          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
                            <img
                              src={`/api/assets/${activeProjectName}/grids/${filename}?t=${lastTick}`}
                              alt={filename}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', transition: 'all 0.3s ease' }}
                            />
                            <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 8px', background: extractedShots[gridIdx]?.length > 0 ? '#4ade80' : '#444', borderRadius: 6, fontSize: 10, color: '#fff', fontWeight: 'bold' }}>
                              {extractedShots[gridIdx]?.length > 0 ? `Folder (${extractedShots[gridIdx].length} extracted)` : `Grid ${gridIdx + 1}`}
                            </div>
                            <button
                              className="expand-btn"
                              onClick={() => setEnlargedImage(`/api/assets/${activeProjectName}/grids/${filename}`)}
                              style={{ position: 'absolute', bottom: 12, right: 12, padding: '8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 8, color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                              title="Expand Image"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                            </button>
                          </div>
                          <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 13, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {filename}
                            </div>

                            {/* ── Per-shot source config toggle ── */}
                            {availableImages.length > 1 && (
                              <button
                                onClick={() => setConfigGridIdx(isConfigOpen ? null : gridIdx)}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${isConfigOpen ? '#a78bfa' : '#333'}`, background: isConfigOpen ? 'rgba(167,139,250,0.1)' : 'transparent', color: isConfigOpen ? '#a78bfa' : '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                              >
                                <span>🎬 Configure Shot Sources {hasCustomAssignments ? '(custom)' : ''}</span>
                                <span style={{ fontSize: 10 }}>{isConfigOpen ? '▲' : '▼'}</span>
                              </button>
                            )}

                            {/* ── Shot slots 1-9 ── */}
                            {isConfigOpen && (
                              <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Shot → Source</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                  {Array.from({ length: 9 }, (_, i) => i + 1).map(slot => (
                                    <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <label style={{ fontSize: 10, color: '#555', fontWeight: 600 }}>Shot {slot}</label>
                                      <select
                                        value={gridAssignments[slot] ?? filename}
                                        onChange={e => {
                                          setShotAssignments(prev => ({
                                            ...prev,
                                            [gridIdx]: { ...(prev[gridIdx] ?? {}), [slot]: e.target.value },
                                          }));
                                        }}
                                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 11, outline: 'none', cursor: 'pointer' }}
                                      >
                                        {availableImages.map(img => (
                                          <option key={img} value={img}>{img}</option>
                                        ))}
                                      </select>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setShotAssignments(prev => { const n = { ...prev }; delete n[gridIdx]; return n; })}
                                  style={{ alignSelf: 'flex-start', marginTop: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#666', fontSize: 11, cursor: 'pointer' }}
                                >
                                  Reset to default
                                </button>
                              </div>
                            )}

                            {extractedShots[gridIdx] ? (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => setViewingExtracted(gridIdx)}
                                  style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #1a1a1a', background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                >
                                  Open Folder Content
                                </button>
                                <button
                                  onClick={async () => {
                                    setStatus('Opening Grok...');
                                    addLog(`Re-extracting Grid ${gridIdx + 1}${hasCustomAssignments ? ' with custom sources' : ''}...`);
                                    const res = await fetch('/api/open-browser', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'extract-shot', gridIndex: gridIdx, filename, projectName: activeProjectName, minDelay: minExtDelay, maxDelay: maxExtDelay, ...(hasCustomAssignments ? { shotAssignments: buildAssignmentsPayload() } : {}) }),
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      setStatus('Extraction complete');
                                      setBrowserOpen(true);
                                      addLog('Grok loop completed. Refreshing UI...');
                                      setViewingExtracted(gridIdx);
                                      fetch('/api/open-browser').then(r => r.json()).then(newData => {
                                        if (newData.extractedShots) setExtractedShots(newData.extractedShots);
                                      });
                                    } else {
                                      setStatus('Failed to extract Grok');
                                      addLog('Failed to extract Grok');
                                    }
                                  }}
                                  style={{ padding: '12px 16px', borderRadius: 8, border: 'none', background: hasCustomAssignments ? '#a78bfa' : '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title={hasCustomAssignments ? 'Re-extract with custom shot sources' : 'Force Re-extract All 9 Shots'}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={async () => {
                                  setStatus('Opening Grok...');
                                  addLog(`Extracting Grid ${gridIdx + 1}${hasCustomAssignments ? ' with custom sources' : ' (all 9 shots)'}`);
                                  const res = await fetch('/api/open-browser', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'extract-shot', gridIndex: gridIdx, filename, projectName: activeProjectName, minDelay: minExtDelay, maxDelay: maxExtDelay, ...(hasCustomAssignments ? { shotAssignments: buildAssignmentsPayload() } : {}) }),
                                  });
                                  if (res.ok) {
                                    setStatus('Extraction complete');
                                    setBrowserOpen(true);
                                    addLog('Grok loop completed. Opening folder...');
                                    setViewingExtracted(gridIdx);
                                    fetch('/api/open-browser').then(r => r.json()).then(newData => {
                                      if (newData.extractedShots) setExtractedShots(newData.extractedShots);
                                    });
                                  } else {
                                    setStatus('Failed to extract Grok');
                                    addLog('Failed to extract Grok');
                                  }
                                }}
                                style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: hasCustomAssignments ? '#a78bfa' : '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                              >
                                {hasCustomAssignments ? '🎬 Extract with Custom Sources' : 'Extract 9 Shots'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── Generated Videos Pipeline ── */}
          {activeTab === 'extraction' && (
            <div style={{ marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: 'linear-gradient(to bottom, #a855f7, #7e22ce)' }} />
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
                  Generated Videos
                </h2>
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500, background: '#111', border: '1px solid #1a1a1a', borderRadius: 20, padding: '2px 10px' }}>
                  {generatedVideos.length} video{generatedVideos.length !== 1 ? 's' : ''}
                </span>
              </div>

              {generatedVideos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#333', border: '1px dashed #1a1a1a', borderRadius: 20 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 16 }}><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></svg>
                  <p style={{ fontSize: 14, margin: 0 }}>No videos generated yet</p>
                  <p style={{ fontSize: 12, color: '#444', marginTop: 8 }}>Click "Generate Video" on any extracted shot to start</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                  {generatedVideos.map(videoFile => {
                    const shotId = videoFile.split('.')[0];
                    const globalNum = Number(shotId);
                    const gridIdx = Math.floor((globalNum - 1) / 9);
                    const slotWithinGrid = ((globalNum - 1) % 9) + 1;
                    const videoSrc = `/api/project-file?project=${encodeURIComponent(activeProjectName)}&folder=videos&file=${encodeURIComponent(videoFile)}`;
                    const grokUrl = videoSources[shotId];
                    const usedPrompt = videoPrompts[shotId];
                    const isExpanded = expandedPrompts[shotId];
                    const isEditingThis = editingVideoInProgress === shotId;
                    const isUpscalingThis = upscalingVideoShot === shotId;
                    return (
                      <div key={videoFile} style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 20, overflow: 'hidden' }}>
                        <video
                          controls
                          style={{ width: '100%', display: 'block', maxHeight: 220, background: '#000', objectFit: 'cover' }}
                          src={videoSrc}
                        />
                        <div style={{ padding: '14px 16px' }}>
                          {/* Header row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>Shot {shotId}</span>
                            <span style={{ fontSize: 11, color: '#555', background: '#111', border: '1px solid #1a1a1a', borderRadius: 20, padding: '2px 8px' }}>
                              Grid {gridIdx + 1} · Slot {slotWithinGrid}
                            </span>
                          </div>

                          {/* Prompt section */}
                          {usedPrompt && (
                            <div style={{ marginBottom: 10 }}>
                              <button
                                onClick={() => setExpandedPrompts(p => ({ ...p, [shotId]: !p[shotId] }))}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><polyline points="9 18 15 12 9 6" /></svg>
                                {isExpanded ? 'Hide prompt' : 'Show prompt'}
                              </button>
                              {isExpanded && (
                                <div style={{ marginTop: 8, padding: 10, background: '#0a0a0a', borderRadius: 10, border: '1px solid #1a1a1a' }}>
                                  <p style={{ fontSize: 11, color: '#777', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{usedPrompt}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions row */}
                          <div style={{ display: 'flex', gap: 8 }}>
                            {/* Edit Video button — only if we have the original source URL */}
                            {(videoOriginalSources[shotId] || grokUrl) && (
                              <button
                                onClick={() => setEditingVideoShot({
                                  shotId,
                                  // Always use the ORIGINAL url (first generation upload), never the edit URL
                                  originalUrl: videoOriginalSources[shotId] || grokUrl,
                                  // Pre-fill with the last prompt so user can tweak it
                                  prompt: videoPrompts[shotId] || '',
                                })}
                                disabled={isEditingThis}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '8px', borderRadius: 10, border: '1px solid #2a1a4a',
                                  background: isEditingThis ? '#1a1a2a' : '#110820', color: isEditingThis ? '#444' : '#a855f7',
                                  fontSize: 11, fontWeight: 600, cursor: isEditingThis ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                                }}
                              >
                                {isEditingThis ? (
                                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Editing...</>
                                ) : (
                                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit Video</>
                                )}
                              </button>
                            )}
                            {/* Upscale button — only if we have a grokUrl */}
                            {grokUrl && (
                              <button
                                onClick={async () => {
                                  setUpscalingVideoShot(shotId);
                                  addLog(`Upscaling video for shot ${shotId} via 3-dots menu...`);
                                  try {
                                    const res = await fetch('/api/open-browser', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'upscale-video', shotId, projectName: activeProjectName }),
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      addLog(`Shot ${shotId} upscaled successfully!`);
                                      if (data.grokUrl) setVideoSources(prev => ({ ...prev, [shotId]: data.grokUrl }));
                                      setLastTick(Date.now());
                                    } else {
                                      const err = await res.json();
                                      addLog(`Upscale failed: ${err.error || 'Unknown error'}`);
                                    }
                                  } catch (e) {
                                    addLog(`Error upscaling: ${String(e)}`);
                                  } finally {
                                    setUpscalingVideoShot(null);
                                  }
                                }}
                                disabled={isUpscalingThis || isEditingThis}
                                title="Upscale to 720p via Grok"
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '8px', borderRadius: 10, border: '1px solid rgba(56,189,248,0.25)',
                                  background: isUpscalingThis ? '#0a1a2a' : 'rgba(56,189,248,0.06)',
                                  color: isUpscalingThis ? '#334' : '#38bdf8',
                                  fontSize: 11, fontWeight: 600,
                                  cursor: isUpscalingThis || isEditingThis ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {isUpscalingThis ? (
                                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Upscaling...</>
                                ) : (
                                  <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 11 12 6 7 11" /><line x1="12" y1="6" x2="12" y2="18" /></svg> Upscale 720p</>
                                )}
                              </button>
                            )}
                            {/* Download */}
                            <a
                              href={videoSrc}
                              download={videoFile}
                              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, border: '1px solid #1a1a1a', background: '#111', color: '#aaa', fontSize: 11, fontWeight: 600, textDecoration: 'none', transition: 'all 0.2s' }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                              Download
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </section>
      </div>

      {/* Image Modal */}
      {enlargedImage && (
        <div
          onClick={() => setEnlargedImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, cursor: 'zoom-out', animation: 'fadeIn 0.2s ease' }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={enlargedImage}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'scaleIn 0.2s ease-out' }}
              alt="Enlarged"
            />
            <button
              onClick={(e) => { e.stopPropagation(); setEnlargedImage(null); }}
              style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .image-card .expand-btn { opacity: 0; transform: translateY(4px); }
        .image-card:hover .expand-btn { opacity: 1; transform: translateY(0); }
      `}} />

      {/* Prompt Tweak Modal for Video Generation */}
      {tweakingVideoShot && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
        }}>
          <div style={{
            backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 24, padding: 32,
            width: '100%', maxWidth: 640, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>Configure Video Prompt</h3>
                <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>Shot {tweakingVideoShot.shotId} — Compose the final instruction for Grok Video</p>
              </div>
              <button
                onClick={() => setTweakingVideoShot(null)}
                style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: 4 }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#aaa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Video Generation Prompt</label>
              <textarea
                value={tweakingVideoShot.prompt}
                onChange={(e) => setTweakingVideoShot({ ...tweakingVideoShot, prompt: e.target.value })}
                placeholder="Describe the motion, style, and details..."
                style={{
                  width: '100%', height: 260, backgroundColor: '#050505', border: '1px solid #1a1a1a',
                  borderRadius: 16, color: '#eee', padding: 20, fontSize: 14, fontFamily: 'inherit',
                  lineHeight: 1.6, resize: 'none', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setTweakingVideoShot(null)}
                style={{ flex: 1, padding: 16, borderRadius: 14, border: '1px solid #1a1a1a', background: 'transparent', color: '#aaa', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { shotId, prompt } = tweakingVideoShot;
                  setTweakingVideoShot(null);
                  setGeneratingVideoShot(shotId);
                  addLog(`Generating video for shot ${shotId}...`);
                  try {
                    const res = await fetch('/api/open-browser', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'generate-video-shot',
                        shotId,
                        compositePrompt: prompt,
                        projectName: activeProjectName,
                      }),
                    });
                    if (res.ok) {
                      addLog(`Video for shot ${shotId} generated successfully! Saved to videos/${shotId}.mp4`);
                    } else {
                      const err = await res.json();
                      addLog(`Video generation failed: ${err.error || 'Unknown error'}`);
                    }
                  } catch (e) {
                    addLog(`Error triggering video generation: ${String(e)}`);
                  } finally {
                    setGeneratingVideoShot(null);
                  }
                }}
                style={{
                  flex: 2, padding: 16, borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                  color: 'white', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(168,85,247,0.3)'
                }}
              >
                🎬 Start Video Generation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Video Modal */}
      {editingVideoShot && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 20
        }}>
          <div style={{
            backgroundColor: '#0a0a0a', border: '1px solid #2a1a4a', borderRadius: 24, padding: 32,
            width: '100%', maxWidth: 640, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>Edit Video</h3>
                <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                  Shot {editingVideoShot.shotId} — tweak the prompt below, then regenerate from the original source
                </p>
              </div>
              <button onClick={() => setEditingVideoShot(null)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Editable prompt — pre-filled with the last used prompt */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#aaa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Video Prompt — edit as needed
              </label>
              <textarea
                value={editingVideoShot.prompt}
                onChange={(e) => setEditingVideoShot({ ...editingVideoShot, prompt: e.target.value })}
                placeholder="Describe the motion, style, mood..."
                autoFocus
                onFocus={(e) => {
                  // Place cursor at end of pre-filled text (only runs once on open)
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                style={{ width: '100%', height: 220, backgroundColor: '#050505', border: '1px solid #2a1a4a', borderRadius: 14, color: '#eee', padding: 16, fontSize: 14, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Info row: shows which original URL will be used */}
            <div style={{ marginBottom: 20, padding: 10, background: '#070707', borderRadius: 10, border: '1px solid #1a1a2a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{ fontSize: 11, color: '#555', margin: 0, lineHeight: 1.4 }}>
                Will re-generate from the <strong style={{ color: '#7e5ca4' }}>original upload conversation</strong> — your prompt edits are applied on top of the source image, not the edited video.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setEditingVideoShot(null)} style={{ flex: 1, padding: 14, borderRadius: 14, border: '1px solid #1a1a1a', background: 'transparent', color: '#aaa', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={!editingVideoShot.prompt.trim()}
                onClick={async () => {
                  const { shotId, originalUrl, prompt: modificationPrompt } = editingVideoShot;
                  setEditingVideoShot(null);
                  setEditingVideoInProgress(shotId);
                  addLog(`Editing video for shot ${shotId} from original source...`);
                  try {
                    const res = await fetch('/api/open-browser', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'edit-video-shot', shotId, modificationPrompt, sourceUrl: originalUrl, projectName: activeProjectName }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      addLog(`Video edit for shot ${shotId} complete!`);
                      if (data.grokUrl) setVideoSources(prev => ({ ...prev, [shotId]: data.grokUrl }));
                      setVideoPrompts(prev => ({ ...prev, [shotId]: modificationPrompt }));
                    } else {
                      const err = await res.json();
                      addLog(`Video edit failed: ${err.error}`);
                    }
                  } catch (e) { addLog(`Error: ${String(e)}`); }
                  finally { setEditingVideoInProgress(null); }
                }}
                style={{ flex: 2, padding: 14, borderRadius: 14, border: 'none', background: editingVideoShot.prompt.trim() ? 'linear-gradient(135deg, #a855f7, #7e22ce)' : '#1a1a1a', color: editingVideoShot.prompt.trim() ? 'white' : '#444', fontWeight: 700, cursor: editingVideoShot.prompt.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
              >🎬 Apply &amp; Regenerate from Original</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
