import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import {
  Play, Pause, SkipForward, SkipBack, Search, ArrowDownUp, Music, Video,
  Folder, Heart, ListMusic, Shuffle, Repeat, ChevronDown, MoreVertical,
  Github, Instagram, Linkedin, Terminal, UserRound, Plus, HardDrive,
  X, Upload, Clock3, Trash2, Check, AudioLines
} from 'lucide-react';
import './style.css';

const DB_NAME = 'errortune-media-library';
const DB_VERSION = 1;
const STORE = 'media';
const NativeMediaLibrary = registerPlugin('MediaLibrary');
const ACCEPTED = /\.(mp3|wav|ogg|flac|m4a|aac|opus|mp4|webm|mkv|avi|mov|wmv|m4v)$/i;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbRequest(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}
const readAll = () => dbRequest('readonly', store => store.getAll());
const saveRecord = record => dbRequest('readwrite', store => store.put(record));
const removeRecord = id => dbRequest('readwrite', store => store.delete(id));
const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmt = value => {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
};
const prettySize = bytes => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function MatrixBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let animationFrame;
    let lastFrame = 0;
    const fontSize = 18;
    let drops = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const columns = Math.ceil(width / fontSize);

      drops = Array.from({ length: columns }, () => ({
        y: Math.random() * height / fontSize,
        speed: 0.35 + Math.random() * 1.1,
        length: 8 + Math.floor(Math.random() * 15)
      }));
    };

    resize();

    const draw = (time) => {
      animationFrame = requestAnimationFrame(draw);

      if (time - lastFrame < 40) return;
      lastFrame = time;

      ctx.fillStyle = 'rgba(3, 1, 2, 0.12)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';

      drops.forEach((drop, i) => {
        const x = i * fontSize + fontSize / 2;

        for (let j = 0; j < drop.length; j++) {
          const y = (drop.y - j) * fontSize;

          if (y < 0 || y > height) continue;

          if (j === 0) {
            ctx.fillStyle = '#ff6870';
            ctx.shadowColor = '#ff172b';
            ctx.shadowBlur = 15;
          } else if (j < 4) {
            ctx.fillStyle = '#ff303d';
            ctx.shadowBlur = 7;
          } else {
            ctx.fillStyle = `rgba(220, 20, 35, ${Math.max(0.12, 0.75 - j / drop.length)})`;
            ctx.shadowBlur = 2;
          }

          ctx.fillText(Math.random() > 0.5 ? '1' : '0', x, y);
        }

        ctx.shadowBlur = 0;
        drop.y += drop.speed;

        if (drop.y * fontSize > height + drop.length * fontSize) {
          drop.y = -Math.random() * 30;
          drop.speed = 0.35 + Math.random() * 1.1;
          drop.length = 8 + Math.floor(Math.random() * 15);
        }
      });
    };

    animationFrame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas
    ref={canvasRef}
    className="matrix"
    aria-hidden="true"
  />;
}
function App() {
  const [library, setLibrary] = useState([]);
  const [favorites, setFavorites] = useState(() => new Set(JSON.parse(localStorage.getItem('errortune-favorites') || '[]')));
  const [activeTab, setActiveTab] = useState('Songs');
  const [currentId, setCurrentId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState('name');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullPlayer, setFullPlayer] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState('');
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const objectUrlRef = useRef(null);

  const scanDeviceMedia = useCallback(async (showMessage = false) => {
    if (!Capacitor.isNativePlatform()) {
      if (showMessage) setToast('Device scanning is available in the Android app.');
      return;
    }

    setBusy(true);
    try {
      const access = await NativeMediaLibrary.requestAccess();

      if (!access?.granted) {
        if (showMessage) setToast('Allow Audio and Video access to scan your media.');
        return;
      }

      const response = await NativeMediaLibrary.listMedia();
      const rows = response?.items || [];
      const nextItems = [];

      for (const item of rows) {
        const filename = item.name || 'Unknown media';
        const record = {
          id: 'device-' + item.id,
          sourceUri: item.uri,
          name: filename.replace(/\\.[^.]+$/, ''),
          filename,
          path: (item.path || '') + filename,
          kind: item.kind,
          size: Number(item.size || 0),
          type: item.mimeType || '',
          duration: Number(item.duration || 0) / 1000,
          addedAt: Number(item.dateAdded || 0) * 1000
        };

        await saveRecord(record);
        const { blob, ...meta } = record;
        nextItems.push(meta);
      }

      setLibrary(prev => [
        ...prev.filter(item => !String(item.id).startsWith('device-')),
        ...nextItems
      ]);

      if (showMessage) {
        setToast(rows.length + ' audio/video files found on your device.');
      }
    } catch (error) {
      console.error('Device media scan failed:', error);
      if (showMessage) {
        setToast(error?.message || 'Could not scan device media.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadLibrary = async () => {
      try {
        const rows = await readAll();
        if (active) {
          setLibrary(rows.map(({ blob, ...meta }) => meta));
        }
      } catch {
        if (active) {
          setStorageError('Browser storage could not be opened. Try a current browser with site storage enabled.');
        }
      }

      if (active && Capacitor.isNativePlatform()) {
        await scanDeviceMedia(false);
      }
    };

    loadLibrary();
    return () => { active = false; };
  }, [scanDeviceMedia]);
  useEffect(() => { localStorage.setItem('errortune-favorites', JSON.stringify([...favorites])); }, [favorites]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const current = library.find(item => item.id === currentId) || null;
  const audioItems = library.filter(item => item.kind === 'audio');
  const videoItems = library.filter(item => item.kind === 'video');
  const folderGroups = useMemo(() => {
    const groups = new Map();
    library.forEach(item => {
      const parts = (item.path || item.filename).split('/');
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Imported files';
      groups.set(folder, (groups.get(folder) || 0) + 1);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [library]);
  const filtered = useMemo(() => {
    let rows = activeTab === 'Videos' ? videoItems : activeTab === 'Favorites'
      ? library.filter(item => favorites.has(item.id))
      : activeTab === 'Folders' ? (selectedFolder ? library.filter(item => { const parts = (item.path || item.filename).split('/'); const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Imported files'; return folder === selectedFolder; }) : library) : audioItems;
    const term = query.trim().toLowerCase();
    if (term) rows = rows.filter(item => `${item.name} ${item.path || ''} ${item.kind}`.toLowerCase().includes(term));
    return [...rows].sort((a, b) => sortMode === 'newest' ? b.addedAt - a.addedAt : a.name.localeCompare(b.name));
  }, [activeTab, audioItems, favorites, library, query, selectedFolder, sortMode, videoItems]);

  const getMediaElement = useCallback(() => current?.kind === 'video' ? videoRef.current : audioRef.current, [current?.kind]);
  const loadAndPlay = useCallback(async (item, shouldPlay = true) => {
    if (!item) return;
    try {
      const stored = await dbRequest('readonly', store => store.get(item.id));
      let url;

      if (stored?.sourceUri) {
        const prepared = await NativeMediaLibrary.prepareMedia({
          uri: stored.sourceUri,
          name: stored.filename || item.filename || 'media-file'
        });
        url = Capacitor.convertFileSrc(prepared.path);
      } else if (stored?.blob) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        url = URL.createObjectURL(stored.blob);
        objectUrlRef.current = url;
      } else {
        throw new Error('The saved media file is missing. Scan or add it again.');
      }
      const element = item.kind === 'video' ? videoRef.current : audioRef.current;
      const other = item.kind === 'video' ? audioRef.current : videoRef.current;
      other.pause(); other.removeAttribute('src'); other.load();
      element.src = url; element.load();
      setCurrentId(item.id); setCurrentTime(0); setDuration(0);
      if (shouldPlay) {
        await element.play(); setPlaying(true);
      } else setPlaying(false);
    } catch (error) {
      setPlaying(false); setToast(error.message || 'Could not play this file.');
    }
  }, []);
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const addFiles = async fileList => {
    const files = [...fileList].filter(file => file.type.startsWith('audio/') || file.type.startsWith('video/') || ACCEPTED.test(file.name));
    if (!files.length) { setToast('No supported audio or video files found.'); return; }
    setBusy(true);
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
      const newItems = [];
      for (const file of files) {
        const kind = file.type.startsWith('video/') || /\.(mp4|webm|mkv|avi|mov|wmv|m4v)$/i.test(file.name) ? 'video' : 'audio';
        const id = makeId();
        const path = file.webkitRelativePath || file.name;
        const record = { id, name: file.name.replace(/\.[^.]+$/, ''), filename: file.name, path, kind, size: file.size, type: file.type, addedAt: Date.now(), blob: file };
        await saveRecord(record);
        const { blob, ...meta } = record; newItems.push(meta);
      }
      setLibrary(prev => [...prev, ...newItems]);
      setActiveTab('Songs'); setSelectedFolder(null); setToast(`${newItems.length} file${newItems.length === 1 ? '' : 's'} saved to your library.`);
    } catch (error) {
      setStorageError('Storage is full or unavailable. Some files may not have been saved.');
      setToast('Could not save files. Check available browser storage.');
    } finally { setBusy(false); }
  };
  const toggleFavorite = id => setFavorites(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id);
    setToast(next.has(id) ? 'Added to Favorites.' : 'Removed from Favorites.'); return next;
  });
  const removeItem = async item => {
    if (!window.confirm(`Remove “${item.filename}” from this library?`)) return;
    await removeRecord(item.id); setLibrary(prev => prev.filter(row => row.id !== item.id));
    setFavorites(prev => { const next = new Set(prev); next.delete(item.id); return next; });
    if (currentId === item.id) { audioRef.current?.pause(); videoRef.current?.pause(); audioRef.current?.removeAttribute('src'); videoRef.current?.removeAttribute('src'); audioRef.current?.load(); videoRef.current?.load(); if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; setCurrentId(null); setPlaying(false); }
    setToast('File removed from library.');
  };
  const togglePlayback = async () => {
    if (!current) { if (filtered[0]) await loadAndPlay(filtered[0]); return; }
    const el = getMediaElement();
    if (!el) return;
    if (el.paused) { try { await el.play(); setPlaying(true); } catch { setToast('Playback was blocked. Press Play again.'); } }
    else { el.pause(); setPlaying(false); }
  };
  const playNext = async () => {
    const queue = activeTab === 'Videos' ? videoItems : audioItems;
    if (!queue.length) return;
    const index = queue.findIndex(item => item.id === currentId);
    const next = shuffle ? queue[Math.floor(Math.random() * queue.length)] : queue[(index + 1 + queue.length) % queue.length];
    await loadAndPlay(next);
  };
  const playPrevious = async () => {
    const queue = activeTab === 'Videos' ? videoItems : audioItems;
    if (!queue.length) return;
    const index = queue.findIndex(item => item.id === currentId);
    await loadAndPlay(queue[(index - 1 + queue.length) % queue.length]);
  };
  const onEnded = async () => {
    if (repeat && getMediaElement()) { getMediaElement().currentTime = 0; await getMediaElement().play(); }
    else await playNext();
  };
  const seek = value => { const el = getMediaElement(); if (el && duration) { el.currentTime = Number(value); setCurrentTime(Number(value)); } };
  const seekVideoBy = seconds => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    setCurrentTime(video.currentTime);
  };

  // Android system media notification and lock-screen controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    if (!current) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }

    if ('MediaMetadata' in window) {
      session.metadata = new window.MediaMetadata({
        title: current.name || 'Unknown media',
        artist: 'ERRORTUNE RED HACKER',
        album: current.kind === 'video' ? 'Videos' : 'Songs'
      });
    }
    session.playbackState = playing ? 'playing' : 'paused';

    const setHandler = (action, callback) => {
      try { session.setActionHandler(action, callback); } catch {}
    };

    setHandler('play', async () => {
      const element = current.kind === 'video' ? videoRef.current : audioRef.current;
      if (element) {
        try { await element.play(); setPlaying(true); }
        catch { setToast('Playback could not resume. Open the app and press Play.'); }
      }
    });
    setHandler('pause', () => {
      (current.kind === 'video' ? videoRef.current : audioRef.current)?.pause();
      setPlaying(false);
    });
    setHandler('stop', () => {
      audioRef.current?.pause();
      videoRef.current?.pause();
      setPlaying(false);
    });
    setHandler('nexttrack', () => playNext());
    setHandler('previoustrack', () => playPrevious());
    setHandler('seekto', details => {
      const element = current.kind === 'video' ? videoRef.current : audioRef.current;
      if (element && Number.isFinite(details.seekTime)) {
        element.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });

    return () => {
      ['play', 'pause', 'stop', 'nexttrack', 'previoustrack', 'seekto'].forEach(action => {
        try { session.setActionHandler(action, null); } catch {}
      });
    };
  }, [currentId, current?.name, current?.kind, playing, activeTab, shuffle, repeat]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session?.setPositionState || !duration || !current) return;
    try {
      session.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(currentTime, duration)
      });
    } catch {}
  }, [currentId, currentTime, duration, current]);


  const tabs = [
    { name: 'Songs', icon: Music, count: audioItems.length },
    { name: 'Videos', icon: Video, count: videoItems.length },
    { name: 'Favorites', icon: Heart, count: favorites.size },
    { name: 'Folders', icon: Folder, count: library.length },
  ];

  return <div className="app-shell">
    <MatrixBackground />
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Terminal size={20}/></div><div><div className="brand-name">&gt;_ errortune</div><div className="brand-sub">LOCAL MEDIA SYSTEM</div></div></div>
      <div className="header-actions">
        <button className={`icon-btn ${searchOpen ? 'active' : ''}`} aria-label="Search" onClick={() => { setSearchOpen(v => !v); setQuery(''); }}><Search/></button>
        <button className="icon-btn" aria-label="Sort library" onClick={() => setSortMode(v => v === 'name' ? 'newest' : 'name')} title={`Sort: ${sortMode}`}><ArrowDownUp/></button>
        <button className="profile-trigger" aria-label="Open creator profile" onClick={() => setProfileOpen(true)}><UserRound size={19}/><span>PROFILE</span></button>
      </div>
    </header>

    {searchOpen && <div className="search-wrap"><Search size={18}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search songs, videos, folders..."/><button className="icon-btn small" onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="Close search"><X size={18}/></button></div>}

    <nav className="tabs">{tabs.map(({name, icon: Icon, count}) => <button key={name} className={`tab ${activeTab === name ? 'selected' : ''}`} onClick={() => { setActiveTab(name); if (name !== 'Folders') setSelectedFolder(null); }}><Icon size={16}/><span>{name}</span><small>{count}</small></button>)}</nav>

    <main className="main-content">
      <section className="section-heading"><div><div className="eyebrow">// MEDIA DIRECTORY</div><h1>{activeTab === 'Folders' ? 'Local File Vault' : activeTab}</h1><p>{activeTab === 'Folders' ? 'All imported media, including folder paths.' : activeTab === 'Favorites' ? 'Your saved tracks and videos.' : `Your ${activeTab.toLowerCase()} collection, stored on this device.`}</p></div><div className="heading-actions">{Capacitor.isNativePlatform() && <button className="outline-btn" onClick={() => scanDeviceMedia(true)} disabled={busy}><HardDrive size={16}/>{busy ? 'Scanning...' : 'Scan device'}</button>}{activeTab === 'Folders' && selectedFolder && <button className="outline-btn" onClick={() => setSelectedFolder(null)}><ChevronDown size={16}/> All folders</button>}<button className="outline-btn" onClick={() => folderRef.current?.click()}><Folder size={16}/> Import folder</button><button className="primary-btn" onClick={() => fileRef.current?.click()} disabled={busy}><Plus size={17}/>{busy ? 'Saving...' : 'Add media'}</button></div></section>
      {storageError && <div className="notice"><HardDrive size={17}/>{storageError}</div>}
      <div className="library-meta"><span><span className="live-dot"/>{filtered.length} ITEMS</span><span>{sortMode === 'name' ? 'SORTED BY NAME' : 'NEWEST FIRST'}</span></div>
      {activeTab === 'Folders' && !selectedFolder && !query ? <div className="folder-grid">{folderGroups.map(([folder, count]) => <button className="folder-card" key={folder} onClick={() => setSelectedFolder(folder)}><Folder size={28}/><strong>{folder}</strong><span>{count} FILE{count === 1 ? '' : 'S'}</span></button>)}{folderGroups.length === 0 && <div className="empty-state"><div className="empty-icon"><Folder/></div><h2>No folders imported</h2><p>Use Import folder to choose a directory. Browser permissions control which folders can be selected.</p><button className="primary-btn" onClick={() => folderRef.current?.click()}><Folder size={16}/> Import folder</button></div>}</div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">{activeTab === 'Favorites' ? <Heart/> : activeTab === 'Videos' ? <Video/> : activeTab === 'Folders' ? <Folder/> : <ListMusic/>}</div><h2>{query ? 'No matching files' : activeTab === 'Favorites' ? 'No favorites yet' : `No ${activeTab.toLowerCase()} found`}</h2><p>{query ? 'Try a different search term.' : activeTab === 'Favorites' ? 'Tap the heart on any track to save it here.' : 'Import media files or a folder to build your local library.'}</p>{!query && activeTab !== 'Favorites' && <button className="primary-btn" onClick={() => fileRef.current?.click()}><Upload size={16}/> Choose media</button>}</div> : <div className={activeTab === 'Videos' ? 'media-grid' : 'track-list'}>
        {filtered.map(item => <article key={item.id} className={`track-row ${currentId === item.id ? 'is-current' : ''}`} onDoubleClick={() => { loadAndPlay(item); setFullPlayer(true); }}>
          <button className="cover" onClick={() => { loadAndPlay(item); setFullPlayer(true); }} aria-label={`Play ${item.name}`}>{item.kind === 'video' ? <Video size={24}/> : <AudioLines size={25}/>}<span className="cover-glow"/></button>
          <button className="track-copy" onClick={() => { loadAndPlay(item); setFullPlayer(true); }}><strong>{item.name}</strong><span>{item.kind.toUpperCase()} <i>•</i> {prettySize(item.size)} <i>•</i> {(item.path || item.filename).split('/').slice(0, -1).join('/') || 'LOCAL LIBRARY'}</span></button>
          <button className={`favorite-btn ${favorites.has(item.id) ? 'favorited' : ''}`} onClick={() => toggleFavorite(item.id)} aria-label={favorites.has(item.id) ? 'Remove favorite' : 'Add favorite'}><Heart size={19} fill={favorites.has(item.id) ? 'currentColor' : 'none'}/></button>
          <button className="more-btn" onClick={() => removeItem(item)} aria-label="Remove from library" title="Remove from library"><Trash2 size={17}/></button>
        </article>)}
      </div>}
    </main>

    <input ref={fileRef} type="file" accept="audio/*,video/*,.mkv,.avi,.flac,.opus" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
    <input ref={folderRef} type="file" accept="audio/*,video/*" multiple webkitdirectory="" directory="" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>

    <audio ref={audioRef} preload="metadata" onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded}/>
    <video ref={videoRef} className={`video-stage ${fullPlayer && current?.kind === 'video' ? 'video-stage-visible' : ''}`} controls={false} playsInline preload="metadata" onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded}/>

    {current?.kind === 'video' && fullPlayer && <div className="video-controls">
      <button className="video-exit" onClick={() => setFullPlayer(false)}>✕ EXIT VIDEO</button>
      <div className="video-control-bottom">
        <div className="video-time"><span>{fmt(currentTime)}</span><span>{fmt(duration)}</span></div>
        <input aria-label="Video progress" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={e => seek(e.target.value)}/>
        <div className="video-buttons">
          <button onClick={() => seekVideoBy(-10)}>−10s</button>
          <button className="video-play" onClick={togglePlayback}>{playing ? '❚❚ PAUSE' : '▶ PLAY'}</button>
          <button onClick={() => seekVideoBy(10)}>+10s</button>
        </div>
      </div>
    </div>}

    {current && <div className="mini-player"><button className="mini-art" onClick={() => setFullPlayer(true)}>{current.kind === 'video' ? <Video/> : <Music/>}</button><button className="mini-info" onClick={() => setFullPlayer(true)}><strong>{current.name}</strong><span>{current.kind.toUpperCase()} · LOCAL FILE</span></button><button className={`favorite-btn mini-fav ${favorites.has(current.id) ? 'favorited' : ''}`} onClick={() => toggleFavorite(current.id)} aria-label="Toggle favorite"><Heart size={18} fill={favorites.has(current.id) ? 'currentColor' : 'none'}/></button><button className="player-control" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button className="player-control" onClick={playNext} aria-label="Next"><SkipForward fill="currentColor"/></button><div className="mini-progress" style={{'--progress': `${duration ? currentTime / duration * 100 : 0}%`}}/></div>}

    {current && <div className={`player-overlay ${fullPlayer ? 'open' : 'closed'}`}><div className="player-panel"><div className="player-top"><button className="icon-btn" onClick={() => setFullPlayer(false)} aria-label="Close player"><ChevronDown/></button><span>NOW PLAYING</span><button className="icon-btn" onClick={() => toggleFavorite(current.id)} aria-label="Toggle favorite"><Heart fill={favorites.has(current.id) ? 'currentColor' : 'none'}/></button></div><div className="player-art">{current.kind === 'video' ? <div className="video-placeholder"><Video size={58}/><span>VIDEO OUTPUT</span></div> : <div className="album-art"><AudioLines size={76}/><span>ERRORTUNE</span></div>}</div><div className="now-playing"><div><h2>{current.name}</h2><p>{current.kind.toUpperCase()} · LOCAL STORAGE</p></div><button className={`favorite-btn ${favorites.has(current.id) ? 'favorited' : ''}`} onClick={() => toggleFavorite(current.id)} aria-label="Toggle favorite"><Heart fill={favorites.has(current.id) ? 'currentColor' : 'none'}/></button></div><div className="seek-area"><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={e => seek(e.target.value)} style={{'--progress': `${duration ? currentTime / duration * 100 : 0}%`}}/><div><span>{fmt(currentTime)}</span><span>{fmt(duration)}</span></div></div><div className="main-controls"><button className={shuffle ? 'control-on' : ''} onClick={() => setShuffle(v => !v)} aria-label="Shuffle"><Shuffle/></button><button onClick={playPrevious} aria-label="Previous"><SkipBack size={29} fill="currentColor"/></button><button className="big-play" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={29} fill="currentColor"/> : <Play size={29} fill="currentColor"/>}</button><button onClick={playNext} aria-label="Next"><SkipForward size={29} fill="currentColor"/></button><button className={repeat ? 'control-on' : ''} onClick={() => setRepeat(v => !v)} aria-label="Repeat"><Repeat/></button></div><div className="player-footer"><span><HardDrive size={14}/> SAVED LOCALLY</span><span><Check size={14}/> LIBRARY SYNCED</span></div></div></div>}

    {profileOpen && <div className="modal-backdrop" onClick={() => setProfileOpen(false)}><section className="profile-modal" onClick={e => e.stopPropagation()}><div className="profile-topline"/><div className="profile-heading"><div><span className="eyebrow">CREATOR ACCESS</span><h2>JD PROFILE</h2><p>ID: ERR-001 // SECURE</p></div><button className="icon-btn" onClick={() => setProfileOpen(false)} aria-label="Close profile"><X/></button></div><div className="creator-card"><div className="jd-logo">JD</div><h3>jd._.___</h3><p>SYSTEM ARCHITECT</p></div><div className="social-links"><a href="https://instagram.com/jd._.___" target="_blank" rel="noreferrer"><Instagram/><span>Instagram</span><b>@jd._.___</b></a><a href="https://github.com/skjd-97" target="_blank" rel="noreferrer"><Github/><span>GitHub</span><b>@skjd-97</b></a><a href="https://www.linkedin.com/in/shaikh-javeed-337872368" target="_blank" rel="noreferrer"><Linkedin/><span>LinkedIn</span><b>Shaikh Javeed</b></a></div><button className="profile-close" onClick={() => setProfileOpen(false)}>CLOSE PROFILE</button></section></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    <footer className="app-footer"><span>ERRORTUNE // RED HACKER EDITION</span><span><span className="live-dot"/> OFFLINE-READY LIBRARY</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
