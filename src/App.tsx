import { useCallback, useEffect, useMemo, useState } from 'react'

type Quote = {
  code: string
  name: string
  price: number
  change: number | null
  changeRate: number | null
  asOf: string
  source: string
}
type StockAnalysis = {
  code: string
  chart: { date: string; close: number }[]
  name: string
  quote: Quote
  turtle: {
    system1Entry20High: number
    system2Entry55High: number
    system1Exit10Low: number
    system2Exit20Low: number
    nAtr20: number
    lastCompletedBarDate: string
    historyBars: number
    status: string
    statusBasis: string
  }
  technical: {
    trend: string
    sma20: number | null
    sma50: number | null
    rsi14: number | null
    macd: number
    macdSignal: number
    atr20: number
    volumeAverage20: number | null
    volumeRatio20: number | null
  }
  analysis: {
    score: number
    scoreLabel: string
    horizons: Record<string, string>
    limitations: string[]
  }
  dataQuality: {
    source: string
    mode: string
    asOf: string
    completedDailyBars: number
    mockFallback: boolean
  }
}
type ApiFailure = { code: string; error: string; message: string }
type Health = {
  version: string
  mode: string
  backend: string
  credentials: { appKeyConfigured: boolean; appSecretConfigured: boolean }
  mockFallback: boolean
  ordersEnabled: boolean
}

const fmt = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const money = (value: number | null | undefined) => value == null ? '—' : fmt(value) + '원'
const pct = (value: number | null | undefined) => value == null ? '—' : (value > 0 ? '+' : '') + fmt(value, 2) + '%'
const dateLabel = (value?: string) => value ? value.slice(0, 10).replace(/-/g, '.') : '—'

const DEFAULT_CODES = ['005930', '000660', '005380']
function savedCodes(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('turtle-v3-watchlist') || 'null')
    if (Array.isArray(parsed)) {
      const codes = parsed.filter((code): code is string => typeof code === 'string' && /^\d{6}$/.test(code))
      return [...new Set(codes)].slice(0, 10).length ? [...new Set(codes)].slice(0, 10) : DEFAULT_CODES
    }
  } catch { /* use defaults when browser storage is unavailable */ }
  return DEFAULT_CODES
}
function storeCodes(codes: string[]) {
  try { window.localStorage.setItem('turtle-v3-watchlist', JSON.stringify([...new Set(codes)].slice(0, 10))) } catch { /* storage may be disabled */ }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...(init?.headers || {}) }, ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : detail?.message || detail?.code || 'API 요청에 실패했습니다.'
    throw new Error(message)
  }
  return body as T
}

function PriceChart({ points }: { points: { date: string; close: number }[] }) {
  if (points.length < 2) return <div className="empty-state">차트 데이터가 부족합니다.</div>
  const values = points.map(point => point.close)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const span = Math.max(1, maximum - minimum)
  const polyline = points.map((point, index) => {
    const x = index / (points.length - 1) * 760
    const y = 170 - (point.close - minimum) / span * 140
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
  return <div className="real-chart">
    <svg viewBox="0 0 780 190" role="img" aria-label="실제 일봉 종가 차트">
      {[30, 65, 100, 135, 170].map(y => <line key={y} x1="0" x2="760" y1={y} y2={y} stroke="#e8edf5" strokeDasharray="3 5" />)}
      <polyline points={polyline} fill="none" stroke="#3159d9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    <div className="chart-axis"><span>{dateLabel(points[0].date)}</span><span>{money(maximum)} · 최고</span><span>{dateLabel(points[points.length - 1].date)}</span></div>
  </div>
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'ENTRY_READY' ? '진입 기준 도달' : status === 'WATCHING' ? '관찰' : status
  return <span className={'status-pill ' + (status === 'ENTRY_READY' ? 'status-entry' : 'status-watch')}>{label}</span>
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [rows, setRows] = useState<StockAnalysis[]>([])
  const [failures, setFailures] = useState<ApiFailure[]>([])
  const [selectedCode, setSelectedCode] = useState('005930')
  const [customCode, setCustomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState('')

  const selected = useMemo(() => rows.find(row => row.code === selectedCode) || rows[0] || null, [rows, selectedCode])

  const loadWatchlist = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [healthResult, listResult] = await Promise.all([
        api<Health>('/api/health'),
        api<{ items: StockAnalysis[]; failures: ApiFailure[] }>(`/api/watchlist?codes=${savedCodes().join(',')}`)
      ])
      setHealth(healthResult)
      setRows(listResult.items)
      setFailures(listResult.failures || [])
      if (listResult.items.length) {
        setSelectedCode(current => listResult.items.some(item => item.code === current) ? current : listResult.items[0].code)
      }
      setLastRefresh(new Date().toLocaleString('ko-KR', { hour12: false }))
      if (!listResult.items.length) setError(listResult.failures?.[0]?.message || '실제 키움 데이터를 가져오지 못했습니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '로컬 API에 연결할 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWatchlist()
    const timer = window.setInterval(() => void loadWatchlist(true), 60000)
    return () => window.clearInterval(timer)
  }, [loadWatchlist])

  const addStock = async () => {
    const code = customCode.trim()
    if (!/^\d{6}$/.test(code)) {
      setError('종목코드 6자리를 입력해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const stock = await api<StockAnalysis>('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      setRows(previous => [stock, ...previous.filter(item => item.code !== code)])
      storeCodes([code, ...savedCodes().filter(saved => saved !== code)])
      setSelectedCode(code)
      setCustomCode('')
      setLastRefresh(new Date().toLocaleString('ko-KR', { hour12: false }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '종목 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const statusText = error ? '데이터 확인 필요' : rows.length ? '실제 API 응답 확인됨' : '연결 확인 중'

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">T</div>
      <div className="brand-copy">
        <div className="brand-title">Turtle Trading Dashboard <span>v3.0</span></div>
        <div className="brand-subtitle">CLOUDFLARE PRODUCTION · KIWOOM REAL REST DATA</div>
      </div>
      <div className={'connection-state ' + (error ? 'is-error' : rows.length ? 'is-good' : '')}>
        <span className="state-dot" />{statusText}
      </div>
      <button className="primary-button" onClick={() => void loadWatchlist()} disabled={loading}>
        {loading ? '조회 중…' : '실제 데이터 새로고침'}
      </button>
    </header>

    <main className="main-content">
      <section className="notice-bar">
        <strong>운영 모드</strong>
        <span>샘플 데이터 사용 안 함</span>
        <span>·</span>
        <span>주문/자동매매 기능 없음</span>
        <span>·</span>
        <span>개인용 조회 대시보드</span>
      </section>

      {error && <div className="error-panel" role="alert"><strong>실제 데이터 조회 실패</strong><span>{error}</span><button onClick={() => void loadWatchlist()}>다시 시도</button></div>}

      <section className="summary-grid">
        <article className="summary-card">
          <div className="card-label">키움 API 자격 증명</div>
          <div className="summary-value">{health?.credentials?.appKeyConfigured && health?.credentials?.appSecretConfigured ? '설정됨' : '확인 필요'}</div>
          <div className="summary-help">키 값은 화면에 표시하지 않습니다.</div>
        </article>
        <article className="summary-card">
          <div className="card-label">실제 데이터 종목</div>
          <div className="summary-value">{rows.length}</div>
          <div className="summary-help">현재 조회에 성공한 종목 수</div>
        </article>
        <article className="summary-card">
          <div className="card-label">마지막 조회</div>
          <div className="summary-value summary-time">{lastRefresh || '—'}</div>
          <div className="summary-help">REST 조회 · 60초마다 갱신</div>
        </article>
        <article className="summary-card">
          <div className="card-label">운영 데이터 검증</div>
          <div className="summary-value">{rows.length && rows.every(row => row.dataQuality.mockFallback === false) ? '실데이터' : '미확인'}</div>
          <div className="summary-help">응답 확인 전 분석값을 만들지 않습니다.</div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>관심종목</h2><p>현재가와 터틀 기준값은 키움 REST API 조회 결과를 사용합니다.</p></div>
          <div className="add-stock">
            <input value={customCode} onChange={event => setCustomCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="종목코드 6자리" aria-label="추가할 종목코드" />
            <button onClick={() => void addStock()} disabled={loading}>종목 조회</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>종목</th><th>현재가</th><th>등락률</th><th>20일 고가</th><th>55일 고가</th><th>N(ATR20)</th><th>터틀 상태</th></tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.code} className={selected?.code === row.code ? 'selected-row' : ''} onClick={() => setSelectedCode(row.code)}>
                <td><button className="stock-link" onClick={event => { event.stopPropagation(); setSelectedCode(row.code) }}><strong>{row.name}</strong><span>{row.code}</span></button></td>
                <td className="number-cell">{money(row.quote.price)}</td>
                <td className={'number-cell ' + ((row.quote.changeRate || 0) > 0 ? 'up' : (row.quote.changeRate || 0) < 0 ? 'down' : '')}>{pct(row.quote.changeRate)}</td>
                <td className="number-cell">{money(row.turtle.system1Entry20High)}</td>
                <td className="number-cell">{money(row.turtle.system2Entry55High)}</td>
                <td className="number-cell">{money(row.turtle.nAtr20)}</td>
                <td><StatusPill status={row.turtle.status} /></td>
              </tr>)}
              {!rows.length && <tr><td colSpan={7} className="empty-state">{loading ? '키움 실제 데이터를 조회하고 있습니다…' : '표시할 실제 데이터가 없습니다. 연결 상태와 오류 메시지를 확인하세요.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {failures.length > 0 && <div className="failure-list"><strong>조회 실패 항목</strong>{failures.map(failure => <div key={failure.code}>{failure.code}: {failure.message}</div>)}</div>}
      </section>

      {selected && <section className="detail-grid">
        <article className="panel detail-main">
          <div className="panel-heading"><div><h2>{selected.name} <span className="code-label">{selected.code}</span></h2><p>종목 분석 · 완료된 일봉 {selected.dataQuality.completedDailyBars}개 기준</p></div><StatusPill status={selected.turtle.status} /></div>
          <div className="price-hero">
            <div className="hero-price">{money(selected.quote.price)}</div>
            <div className={'hero-change ' + ((selected.quote.changeRate || 0) > 0 ? 'up' : (selected.quote.changeRate || 0) < 0 ? 'down' : '')}>{pct(selected.quote.changeRate)}</div>
            <div className="hero-time">조회 시각 {selected.quote.asOf.replace('T', ' ')}</div>
          </div>
          <div className="chart-heading">최근 60개 완료 일봉 종가</div>
          <PriceChart points={selected.chart} />
          <div className="levels-grid">
            <div><span>System 1 진입선 · 20일 고가</span><strong>{money(selected.turtle.system1Entry20High)}</strong></div>
            <div><span>System 2 진입선 · 55일 고가</span><strong>{money(selected.turtle.system2Entry55High)}</strong></div>
            <div><span>System 1 청산선 · 10일 저가</span><strong>{money(selected.turtle.system1Exit10Low)}</strong></div>
            <div><span>System 2 청산선 · 20일 저가</span><strong>{money(selected.turtle.system2Exit20Low)}</strong></div>
            <div><span>N · ATR(20)</span><strong>{money(selected.turtle.nAtr20)}</strong></div>
            <div><span>마지막 완료 일봉</span><strong>{dateLabel(selected.turtle.lastCompletedBarDate)}</strong></div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><h2>종목 종합분석</h2><p>규칙 기반 지표 · 확률 예측 아님</p></div></div>
          <div className="score-wrap"><div className="score-number">{selected.analysis.score}<small>/100</small></div><div><strong>{selected.technical.trend}</strong><p>{selected.analysis.scoreLabel}</p></div></div>
          <div className="indicator-list">
            <div><span>20일 이동평균</span><strong>{money(selected.technical.sma20)}</strong></div>
            <div><span>50일 이동평균</span><strong>{money(selected.technical.sma50)}</strong></div>
            <div><span>RSI(14)</span><strong>{fmt(selected.technical.rsi14, 1)}</strong></div>
            <div><span>MACD / Signal</span><strong>{fmt(selected.technical.macd, 2)} / {fmt(selected.technical.macdSignal, 2)}</strong></div>
            <div><span>20일 평균 대비 거래량</span><strong>{selected.technical.volumeRatio20 == null ? '—' : fmt(selected.technical.volumeRatio20, 2) + '배'}</strong></div>
          </div>
          <div className="limitation-note">{selected.analysis.limitations.map(item => <p key={item}>{item}</p>)}</div>
        </article>
      </section>}

      <footer className="footer-note">
        <div><strong>데이터 출처</strong> {rows.length ? '키움증권 운영 REST API' : '연결 확인 전'} · <strong>모드</strong> PRODUCTION</div>
        <div>API 연결, 일봉 필드, 수정주가 및 지표 계산 검증이 완료되기 전에는 매매 판단에 사용하지 마세요.</div>
      </footer>
    </main>
  </div>
}
