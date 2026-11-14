/** Show attribution together with the scope of the linguistic evidence. */
export default function SourceCitation({ reference }) {
    if (!reference) return null;
    let safeUrl = null;
    try {
        const url = new URL(reference.url);
        if (url.protocol === 'https:') safeUrl = url.href;
    } catch { /* Legacy citations can still be displayed as plain text. */ }
    return (
        <aside className="source-citation" aria-label="Nguồn học liệu">
            <strong>Nguồn học liệu</strong>
            <p>{safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer">{reference.title}</a> : reference.title}</p>
            {reference.locator && <p>{reference.locator}</p>}
            {reference.dialect && <p><b>Vùng/ngữ liệu:</b> {reference.dialect}</p>}
            {reference.note && <p>{reference.note}</p>}
        </aside>
    );
}
