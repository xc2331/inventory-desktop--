export default function SearchHighlight({ text, keyword }) {
  if (!keyword || !text) return <span>{text}</span>
  const parts = String(text).split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <span>
      {parts.map((p, i) => p.toLowerCase() === keyword.toLowerCase()
        ? <mark key={i} className="bg-amber-200/60 text-amber-900 px-0.5 rounded">{p}</mark>
        : <span key={i}>{p}</span>
      )}
    </span>
  )
}