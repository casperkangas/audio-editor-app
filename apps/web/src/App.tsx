import { useRef, useState } from 'react'
import './App.css'

const waveform = [22, 34, 18, 42, 54, 29, 63, 45, 76, 38, 56, 82, 61, 44, 70, 92, 58, 36, 68, 49, 78, 57, 34, 63, 88, 48, 71, 39, 55, 82, 66, 43, 72, 94, 60, 31, 52, 77, 45, 69, 83, 51, 27, 62, 74, 43, 59, 35, 69, 88, 47, 72, 56, 38, 67, 91, 58, 33, 48, 75, 52, 41, 64, 82, 46, 70, 57, 32, 53, 78, 44, 63, 86, 55, 37, 69, 49, 73, 58, 31, 46, 66, 84, 52, 39, 61, 76, 45, 68, 51]

function App() {
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(34)
  const [selection] = useState({ start: 22, end: 57 })
  const [activeTool, setActiveTool] = useState('Select')
  const [volume, setVolume] = useState(72)
  const [exportOpen, setExportOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleFile = (file?: File) => {
    if (!file) return
    const supported = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/mp4'].includes(file.type)
    if (!supported && !/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(file.name)) {
      setNotice('That file type is not supported. Try MP3, WAV, FLAC, OGG, or M4A.')
      return
    }
    setFileName(file.name)
    setNotice('Audio loaded. Select a section of the waveform to start editing.')
  }

  const applyEdit = (label: string) => setNotice(`${label} applied to the selected region. Your original file stays untouched.`)

  return (
    <main className="app-shell">
      <header className="topbar"><a className="brand" href="/" aria-label="Sonicraft home"><span className="brand-mark">⌁</span><span>Sonicraft</span></a><div className="topbar-actions"><span className="save-state"><span className="status-dot" /> Saved locally</span><button className="icon-button" aria-label="Help">?</button><button className="avatar" aria-label="Account">AC</button></div></header>
      <section className="workspace">
        <div className="intro-row"><div><p className="eyebrow">A quiet place for loud ideas</p><h1>Shape your sound.</h1><p className="lede">Trim, polish, and convert audio right in your browser.</p></div><div className="privacy-note"><span className="lock">⌑</span><span><strong>Private by default</strong><br />Your audio stays in this session.</span></div></div>
        {!fileName ? <div className="upload-card" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]) }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click() }}><input ref={fileInput} type="file" accept="audio/*" hidden onChange={(event) => handleFile(event.target.files?.[0])} /><div className="upload-glyph">↑</div><h2>Drop an audio file here</h2><p>or choose a file from your device</p><button className="primary-button" type="button" onClick={(event) => { event.stopPropagation(); fileInput.current?.click() }}>Choose audio file <span>→</span></button><p className="file-hint">MP3, WAV, FLAC, OGG, M4A <span>·</span> up to 250 MB</p></div> : <div className="editor-card">
          <div className="file-bar"><div className="file-title"><span className="audio-icon">◖</span><div><strong>{fileName}</strong><span>WAV audio · 03:42</span></div></div><button className="text-button" onClick={() => { setFileName(''); setNotice('') }}>Replace file</button></div>
          <div className="waveform-wrap"><div className="timeline"><span>00:00</span><span>01:14</span><span>02:28</span><span>03:42</span></div><div className="waveform" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPosition(Math.round(((event.clientX - rect.left) / rect.width) * 100)) }} aria-label="Audio waveform"><div className="selection" style={{ left: `${selection.start}%`, width: `${selection.end - selection.start}%` }} /><div className="playhead" style={{ left: `${position}%` }} />{waveform.map((height, index) => <span key={index} className={index / waveform.length * 100 < position ? 'played' : ''} style={{ height: `${height}%` }} />)}</div><div className="selection-label" style={{ left: `${selection.start}%` }}>Selected region · 00:48</div></div>
          <div className="transport"><button className="transport-button" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? 'Ⅱ' : '▶'}</button><span className="timecode">01:16 <span>/ 03:42</span></span><div className="transport-actions"><button className="tool-button" onClick={() => applyEdit('Undo')} disabled><span>↶</span> Undo</button><button className="tool-button"><span>↷</span> Redo</button><span className="divider" /><label className="volume-control">Volume <input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label></div></div>
          <div className="tool-row"><div className="tool-group"><span className="tool-label">Edit selection</span>{['Select', 'Trim', 'Delete', 'Split'].map((tool) => <button key={tool} className={`edit-button ${activeTool === tool ? 'active' : ''}`} onClick={() => { setActiveTool(tool); if (tool !== 'Select') applyEdit(tool) }}>{tool}</button>)}</div><div className="tool-group"><span className="tool-label">Effects</span><button className="edit-button" onClick={() => applyEdit('Fade in')}>Fade in</button><button className="edit-button" onClick={() => applyEdit('Fade out')}>Fade out</button></div></div>
        </div>}
        <div className="bottom-row"><div className={`notice ${notice ? 'visible' : ''}`} aria-live="polite"><span>✦</span>{notice || ' '}</div><button className="export-button" onClick={() => setExportOpen(true)} disabled={!fileName}>Export audio <span>↗</span></button></div>
        {exportOpen && <div className="export-panel"><div><p className="eyebrow">Final step</p><h2>Export your audio</h2><p className="panel-copy">Your edits will be rendered once, keeping the original file intact.</p></div><label>Format<select defaultValue="MP3"><option>MP3</option><option>WAV</option><option>FLAC</option><option>OGG</option></select></label><label>Quality<select defaultValue="High · 256 kbps"><option>High · 256 kbps</option><option>Standard · 192 kbps</option><option>Compact · 128 kbps</option></select></label><div className="panel-actions"><button className="text-button" onClick={() => setExportOpen(false)}>Cancel</button><button className="primary-button" onClick={() => { setExportOpen(false); setNotice('Export queued. Your download will be ready shortly.') }}>Start export <span>→</span></button></div></div>}
      </section>
      <footer><span>Sonicraft <span className="footer-dot">·</span> Browser audio editor</span><span>No account required <span className="footer-dot">·</span> Your files stay private</span></footer>
    </main>
  )
}

export default App
