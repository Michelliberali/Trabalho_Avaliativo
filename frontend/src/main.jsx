import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Camera, CheckCircle2, Clock3,
  Coffee, Fingerprint, LayoutDashboard, LoaderCircle, Plus, RefreshCw,
  ShieldCheck, Upload, Users, X,
} from 'lucide-react'
import './styles.css'

const labels = {
  entrada: 'Entrada',
  saida: 'Saída',
  intervalo_inicio: 'Início do intervalo',
  intervalo_fim: 'Fim do intervalo',
}

const typeIcons = {
  entrada: ArrowDownLeft,
  saida: ArrowUpRight,
  intervalo_inicio: Coffee,
  intervalo_fim: Clock3,
}

async function api(path, options) {
  const response = await fetch(`/api${path}`, options)
  let body = {}
  try { body = await response.json() } catch { /* server unavailable */ }
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Não foi possível concluir a operação.')
  return body
}

function CameraInput({ onPhoto, photo, onClear }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const inputRef = useRef(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setActive(false)
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), [])

  async function startCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 960 }, audio: false })
      streamRef.current = stream
      setActive(true)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream })
    } catch {
      setError('Não foi possível acessar a câmera. Verifique a permissão ou envie uma foto.')
    }
  }

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) onPhoto(new File([blob], 'captura.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', .9)
    stopCamera()
  }

  const preview = photo ? URL.createObjectURL(photo) : null
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  return <div className="camera-input">
    {photo ? <div className="photo-preview"><img src={preview} alt="Foto selecionada" /><button type="button" className="clear-photo" onClick={onClear} aria-label="Remover foto"><X size={18}/></button></div>
      : active ? <div className="camera-live"><video ref={videoRef} autoPlay playsInline muted /><div className="face-guide"/><button type="button" className="capture-button" onClick={capture}><Camera size={18}/> Capturar foto</button></div>
      : <div className="camera-empty"><div className="camera-mark"><Camera size={29}/></div><strong>Posicione seu rosto na câmera</strong><span>Boa iluminação ajuda no reconhecimento</span><div className="camera-actions"><button type="button" className="button secondary" onClick={startCamera}><Camera size={16}/> Abrir câmera</button><button type="button" className="button ghost" onClick={() => inputRef.current?.click()}><Upload size={16}/> Enviar foto</button></div></div>}
    <input ref={inputRef} hidden type="file" accept="image/*" onChange={event => { if (event.target.files?.[0]) { onPhoto(event.target.files[0]); stopCamera() } event.target.value = '' }} />
    {error && <p className="inline-error">{error}</p>}
  </div>
}

function App() {
  const [page, setPage] = useState('dashboard')
  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [recordType, setRecordType] = useState('entrada')
  const [form, setForm] = useState({ name: '', registration: '', role: '' })

  async function refresh() {
    try {
      const [people, punches] = await Promise.all([api('/employees'), api('/records')])
      setEmployees(people)
      setRecords(punches)
      setNotice(null)
    } catch (error) { setNotice({ kind: 'error', text: `${error.message} Verifique se a API está ligada.` }) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function submitEmployee(event) {
    event.preventDefault()
    if (!photo) { setNotice({ kind: 'error', text: 'Adicione uma foto do funcionário.' }); return }
    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => data.append(key, value))
    data.append('photo', photo)
    setBusy(true); setNotice(null)
    try {
      await api('/employees', { method: 'POST', body: data })
      setForm({ name: '', registration: '', role: '' }); setPhoto(null)
      await refresh()
      setNotice({ kind: 'success', text: 'Funcionário cadastrado com sucesso.' })
      setPage('employees')
    } catch (error) { setNotice({ kind: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  async function submitRecord(event) {
    event.preventDefault()
    if (!photo) { setNotice({ kind: 'error', text: 'Capture ou envie uma foto para registrar o ponto.' }); return }
    const data = new FormData()
    data.append('record_type', recordType)
    data.append('photo', photo)
    setBusy(true); setNotice(null)
    try {
      const result = await api('/records', { method: 'POST', body: data })
      setPhoto(null)
      await refresh()
      setNotice({ kind: 'success', text: `Ponto registrado para ${result.employee_name}: ${labels[result.record_type]}.` })
      setPage('dashboard')
    } catch (error) { setNotice({ kind: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  function navigate(next) { setPage(next); setPhoto(null); setNotice(null) }
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const todayCount = records.filter(item => new Date(item.recorded_at).toDateString() === new Date().toDateString()).length

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><Fingerprint size={26}/></span><span><strong>Ponto<span>Facial</span></strong><small>Gestão de frequência</small></span></div>
      <div className="side-label">MENU PRINCIPAL</div>
      <nav aria-label="Navegação principal">
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><LayoutDashboard size={19}/> Visão geral</button>
        <button className={page === 'register' ? 'active' : ''} onClick={() => navigate('register')}><Camera size={19}/> Registrar ponto</button>
        <button className={page === 'employees' ? 'active' : ''} onClick={() => navigate('employees')}><Users size={19}/> Funcionários</button>
      </nav>
      <div className="side-footer"><ShieldCheck size={20}/><div><strong>Dados protegidos</strong><span>Fotos armazenadas localmente</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><Fingerprint size={21}/> PontoFacial</div><div className="topbar-date"><CalendarDays size={17}/><span>{today}</span></div><span className="avatar">PF</span></header>
      <div className="content">
        {notice && <div className={`notice ${notice.kind}`} role="alert"><span>{notice.kind === 'success' ? <CheckCircle2 size={19}/> : <X size={19}/>}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={16}/></button></div>}
        {page === 'dashboard' && <>
          <div className="page-heading"><div><div className="eyebrow">PAINEL DE CONTROLE</div><h1>Visão geral</h1><p>Acompanhe os registros e a equipe em um só lugar.</p></div><button className="button primary" onClick={() => navigate('register')}><Camera size={18}/> Registrar ponto</button></div>
          <div className="stats"><div className="stat-card"><span className="stat-icon blue"><Users size={23}/></span><span>Funcionários cadastrados</span><strong>{employees.length}</strong><small>Total da equipe</small></div><div className="stat-card"><span className="stat-icon green"><Clock3 size={23}/></span><span>Registros hoje</span><strong>{todayCount}</strong><small>Entradas, saídas e intervalos</small></div><div className="stat-card accent"><span className="stat-icon white"><Fingerprint size={23}/></span><span>Reconhecimento facial</span><strong>Ativo</strong><small>Identificação biométrica</small></div></div>
          <div className="section-title"><div><h2>Registros recentes</h2><p>Últimas movimentações da equipe</p></div><button className="icon-button" onClick={refresh} aria-label="Atualizar registros"><RefreshCw size={18}/></button></div>
          <RecordsTable records={records} loading={loading}/>
        </>}
        {page === 'register' && <><div className="page-heading"><div><div className="eyebrow">IDENTIFICAÇÃO BIOMÉTRICA</div><h1>Registrar ponto</h1><p>Capture uma foto para identificar o funcionário e salvar o horário.</p></div></div><div className="form-layout"><form className="panel form-panel" onSubmit={submitRecord}><h2>Selecione o registro</h2><p className="muted">Escolha o tipo de movimentação e tire uma foto do rosto.</p><div className="type-grid">{Object.keys(labels).map(type => { const Icon = typeIcons[type]; return <button type="button" key={type} className={`type-option ${recordType === type ? 'selected' : ''}`} onClick={() => setRecordType(type)}><Icon size={20}/><span>{labels[type]}</span></button> })}</div><label className="field-label">Foto para identificação</label><CameraInput photo={photo} onPhoto={setPhoto} onClear={() => setPhoto(null)}/><button className="button primary submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Fingerprint size={18}/>} {busy ? 'Reconhecendo rosto...' : 'Identificar e registrar'}</button></form><div className="help-panel"><span className="help-icon"><ShieldCheck size={24}/></span><h3>Como funciona?</h3><p>O sistema compara a foto capturada com as fotos dos funcionários cadastrados. Quando encontra uma correspondência, salva a data e o horário automaticamente.</p><div className="help-step"><span>01</span> Escolha o tipo de registro</div><div className="help-step"><span>02</span> Capture uma foto nítida</div><div className="help-step"><span>03</span> Confirme a identificação</div></div></div></>}
        {page === 'employees' && <><div className="page-heading"><div><div className="eyebrow">GESTÃO DE EQUIPE</div><h1>Funcionários</h1><p>Cadastre e consulte quem pode registrar ponto.</p></div><button className="button primary" onClick={() => navigate('addEmployee')}><Plus size={18}/> Novo funcionário</button></div><div className="panel employee-panel"><div className="panel-title"><h2>Equipe cadastrada</h2><span className="count-badge">{employees.length} {employees.length === 1 ? 'pessoa' : 'pessoas'}</span></div>{employees.length ? <div className="table-wrap"><table><thead><tr><th>FUNCIONÁRIO</th><th>MATRÍCULA</th><th>CARGO</th><th>CADASTRO</th></tr></thead><tbody>{employees.map(e => <tr key={e.id}><td><div className="person"><span className="person-avatar">{e.name.slice(0,2).toUpperCase()}</span><strong>{e.name}</strong></div></td><td>{e.registration}</td><td>{e.role}</td><td>{formatDate(e.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="Nenhum funcionário cadastrado" text="Cadastre a primeira pessoa para começar a usar o ponto facial." action={<button className="button primary" onClick={() => navigate('addEmployee')}><Plus size={16}/> Cadastrar funcionário</button>}/>}</div></>}
        {page === 'addEmployee' && <><div className="page-heading"><div><div className="eyebrow">GESTÃO DE EQUIPE</div><h1>Novo funcionário</h1><p>Preencha os dados e adicione uma foto facial nítida.</p></div></div><form className="panel form-panel employee-form" onSubmit={submitEmployee}><h2>Dados do funcionário</h2><p className="muted">A foto será usada apenas para a identificação no registro de ponto.</p><div className="input-grid"><label>Nome completo<input required maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Maria Silva"/></label><label>Matrícula<input required maxLength="120" value={form.registration} onChange={e => setForm({ ...form, registration: e.target.value })} placeholder="Ex.: 2024001"/></label><label className="full">Cargo<input required maxLength="120" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Ex.: Analista administrativo"/></label></div><label className="field-label">Foto facial</label><CameraInput photo={photo} onPhoto={setPhoto} onClear={() => setPhoto(null)}/><div className="form-actions"><button type="button" className="button secondary" onClick={() => navigate('employees')}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {busy ? 'Cadastrando...' : 'Cadastrar funcionário'}</button></div></form></>}
      </div>
    </main>
  </div>
}

function formatDate(value) { return new Date(value).toLocaleDateString('pt-BR') }
function formatTime(value) { return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }

function RecordsTable({ records, loading }) {
  return <div className="panel records-panel">{records.length ? <div className="table-wrap"><table><thead><tr><th>FUNCIONÁRIO</th><th>TIPO</th><th>DATA</th><th>HORÁRIO</th></tr></thead><tbody>{records.map(record => { const Icon = typeIcons[record.record_type] || Clock3; return <tr key={record.id}><td><div className="person"><span className="person-avatar">{record.employee_name.slice(0,2).toUpperCase()}</span><strong>{record.employee_name}</strong></div></td><td><span className={`record-tag ${record.record_type}`}><Icon size={14}/>{labels[record.record_type]}</span></td><td>{formatDate(record.recorded_at)}</td><td><strong>{formatTime(record.recorded_at)}</strong></td></tr> })}</tbody></table></div> : <EmptyState icon={Clock3} title={loading ? 'Carregando registros...' : 'Nenhum registro ainda'} text="Os registros de ponto aparecerão aqui após a primeira identificação."/>}</div>
}

function EmptyState({ icon: Icon, title, text, action }) { return <div className="empty-state"><span><Icon size={28}/></span><h3>{title}</h3><p>{text}</p>{action}</div> }

createRoot(document.getElementById('root')).render(<App />)
