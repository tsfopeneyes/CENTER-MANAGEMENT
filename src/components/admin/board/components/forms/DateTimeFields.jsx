import React, { useEffect, useState } from 'react';
import DatePicker from '../../../../common/DatePicker';
import TimePicker from '../../../../common/TimePicker';
import { splitDateTime, joinDateTime } from '../../utils/noticeHelpers';

// Both values stay in the form's KST input format. A time-only draft must not
// invent a date (especially for legacy programs with no recruitment start).
export default function DateTimeFields({ label, value, onChange, required = false }) {
    const { date, time } = splitDateTime(value);
    const [draftTime, setDraftTime] = useState(time);
    useEffect(() => { setDraftTime(time); }, [value, time]);

    return <div role="group" aria-label={label} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2">
        <DatePicker label={`${label} 날짜`} value={date} onChange={nextDate => onChange(joinDateTime(nextDate, draftTime))} required={required} />
        <TimePicker
            label={`${label} 시간`}
            value={date ? time : draftTime}
            onChange={nextTime => {
                setDraftTime(nextTime);
                if (date) onChange(joinDateTime(date, nextTime));
            }}
        />
    </div>;
}
