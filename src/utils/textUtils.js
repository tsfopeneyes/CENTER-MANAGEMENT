export const stripHtml = (html) => {
    if (!html) return '';
    // 줄바꿈 태그(<br>, </p>, </div>, </li>, </h1~6>, </tr> 등) 및 개행문자를 공백(" ")으로 치환하여 단어가 뭉치지 않게 처리
    const processedHtml = html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
        .replace(/[\r\n]+/g, ' ');

    const tmp = document.createElement("DIV");
    tmp.innerHTML = processedHtml;
    const text = tmp.textContent || tmp.innerText || "";

    // 연속된 공백 정리 후 앞뒤 공백 제거
    return text.replace(/\s+/g, ' ').trim();
};

export const getFirstParagraph = (html) => {
    if (!html) return '';
    // 줄바꿈 태그(<br>, </p>, </div>, </li> 등)를 개행문자(\n)로 변환
    const textWithNewlines = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');

    const tmp = document.createElement("DIV");
    tmp.innerHTML = textWithNewlines;
    const fullText = tmp.textContent || tmp.innerText || '';

    // 첫 번째 비어있지 않은 단락/줄만 추출
    const lines = fullText.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    return lines[0] || '';
};

export const extractUrls = (text) => {
    if (!text) return [];
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.match(urlRegex) || [];
};

export const extractProgramInfo = (content) => {
    const info = { date: '', duration: '', location: '', cleanContent: content };
    if (!content) return info;

    // Matches the info block div and its contents (both light grey #f8fafc and challenge light green #f0fdf4)
    const infoBlockRegex = /<div style="background-color: #(?:f8fafc|f0fdf4);[\s\S]*?<\/div>/;
    const match = content.match(infoBlockRegex);

    if (match) {
        const block = match[0];
        info.cleanContent = content.replace(infoBlockRegex, '').trim();

        // Extract Date (tries to parse the locale string back to ISO-ish)
        const dateMatch = block.match(/📅 일정:<\/strong>\s*([^<]+)/);
        if (dateMatch) {
            const dateStr = dateMatch[1].trim();
            if (dateStr !== '미정') {
                const parts = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
                if (parts) {
                    let [_, year, month, day, ampm, hour, minute] = parts;
                    hour = parseInt(hour);
                    if (ampm === '오후' && hour < 12) hour += 12;
                    if (ampm === '오전' && hour === 12) hour = 0;
                    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    const isoTime = `${hour.toString().padStart(2, '0')}:${minute}`;
                    info.date = `${isoDate}T${isoTime}`;
                }
            }
        }

        // Extract Duration
        const durationMatch = block.match(/⏰ 소요시간:<\/strong>\s*([^<]+)/);
        if (durationMatch) info.duration = durationMatch[1].trim() === '미정' ? '' : durationMatch[1].trim();

        // Extract Location
        const locationMatch = block.match(/📍 장소:<\/strong>\s*([^<]+)/);
        if (locationMatch) info.location = locationMatch[1].trim() === '미정' ? '' : locationMatch[1].trim();
    }

    return info;
};
