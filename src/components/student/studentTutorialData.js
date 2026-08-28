import { CATEGORIES } from '../../constants/appConstants';

export const TUTORIAL_PROGRAM_PREFIX = 'tutorial-program-';
export const TUTORIAL_NOTICE_ID = 'tutorial-notice-center-guide';

const nextWeekdayAt = (weekday, hour, minute = 0, weekOffset = 0) => {
    const date = new Date();
    const days = ((weekday - date.getDay() + 7) % 7) || 7;
    date.setDate(date.getDate() + days + (weekOffset * 7));
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
};

const findSource = (programs, matcher) => (programs || []).find((program) => {
    const title = String(program.title || program.name || program.program_name || '').trim().toUpperCase();
    return matcher(title);
});

const buildProgram = ({ source, id, title, description, shortDescription, date, location, recruiting = true, challenge = false }) => ({
    ...(source || {}),
    id,
    title,
    category: CATEGORIES.PROGRAM,
    short_description: shortDescription || description,
    content: source?.content || `<p>${description}</p><p>튜토리얼에서 프로그램 상세 화면과 참여 방법을 체험하기 위한 예시 일정입니다.</p>`,
    program_date: date,
    program_start_date: date,
    program_end_date: date,
    program_location: source?.program_location || location,
    program_duration: source?.program_duration || 2,
    max_capacity: source?.max_capacity || 20,
    current_applicants: 0,
    is_recruiting: recruiting,
    is_challenge: challenge,
    recruitment_deadline: nextWeekdayAt(4, 23, 59),
    program_status: 'ACTIVE',
    is_ended: false,
    tutorial_mode: true,
    created_at: new Date().toISOString(),
    guest_properties: {
        ...(source?.guest_properties || {}),
        is_ended: false,
        program_status: 'ACTIVE'
    },
    challenge_missions: challenge
        ? (source?.challenge_missions || [
            { id: 'tutorial-mission-1', title: '오늘 감사한 일 한 가지 기록하기', description: '오늘 감사했던 순간을 글로 남겨 보세요.', auth_type: 'text' },
            { id: 'tutorial-mission-2', title: '말씀 한 구절 읽고 느낀 점 쓰기', description: '읽은 말씀과 느낀 점을 짧게 기록해 보세요.', auth_type: 'text' },
            { id: 'tutorial-mission-3', title: '친구에게 따뜻한 말 건네기', description: '오늘 실천한 내용을 글로 인증해 보세요.', auth_type: 'text' }
        ])
        : (source?.challenge_missions || [])
});

export const buildTutorialPrograms = (allPrograms = []) => {
    const dinner = findSource(allPrograms, (title) => title.includes('DINNER CHURCH'));
    const runUp = findSource(allPrograms, (title) => title.includes('RUN-UP') || title.includes('RUN UP'));
    const conversation = findSource(allPrograms, (title) => title.includes('대화가 필요해'));
    const boardGame = findSource(allPrograms, (title) => title.includes('보드게임'));
    const challenge = findSource(allPrograms, (title) => title.includes('HAIFN CHALLENGE') && (title.includes('MSCH') || title.includes('제자학교')));
    const mschChallenge = challenge || {
        short_description: '우리는 서로 얼마나 연결되어 있나요? 매주 교회에서 예배를 드리고 훈련을 받으며 하나님과의 연결을 누리고 있지만, 그 시간을 같이 보내고 있는 우리는 함께하는 기쁨을 얼마나 누리고 있을까요! 오늘 활동을 통해서 서로가 연결되는 즐거움을 경험해봅시다.',
        content: '<p>우리는 서로 얼마나 연결되어 있나요?</p><p>매주 교회에서 예배를 드리고 훈련을 받으며 하나님과의 연결을 누리고 있지만, 그 시간을 같이 보내고 있는 우리는 함께하는 기쁨을 얼마나 누리고 있을까요!</p><p>오늘 활동을 통해서 서로가 연결되는 즐거움을 경험해봅시다.</p>',
        program_location: '하이픈 2F SQUARE', max_capacity: 0,
        challenge_missions: [
            { id: 'msch-msg', title: 'MSG', description: '오늘 묵상을 통해 간직하고 싶은 내용은 무엇인가요?', auth_type: 'text' },
            { id: 'msch-boardgame', title: '보드게임', description: '친구들과 보드게임을 하며 서로 연결되는 시간을 가져보세요.', auth_type: 'text' },
            { id: 'msch-haifn-ticket', title: '하이픈티켓', description: '오늘 함께한 즐거움과 연결의 순간을 기록해 보세요.', auth_type: 'text' }
        ]
    };

    return [
        buildProgram({
            source: dinner,
            id: `${TUTORIAL_PROGRAM_PREFIX}dinner-church`,
            title: 'DINNER CHURCH',
            description: '함께 음식을 나누며 서로의 일상과 이야기를 알아가는 다이닝 프로그램입니다.',
            date: nextWeekdayAt(5, 17, 30),
            location: '하이픈 3F ROUND'
        }),
        buildProgram({
            source: runUp,
            id: `${TUTORIAL_PROGRAM_PREFIX}run-up`,
            title: 'RUN-UP!',
            description: '함께 몸을 움직이며 에너지와 즐거움을 나누는 프로그램입니다.',
            date: nextWeekdayAt(3, 16, 30, 1),
            location: '하이픈 2F SQUARE'
        }),
        buildProgram({
            source: conversation,
            id: `${TUTORIAL_PROGRAM_PREFIX}conversation`,
            title: '대화가 필요해',
            description: '편안한 분위기에서 서로의 생각과 고민을 나누는 대화 프로그램입니다.',
            date: nextWeekdayAt(4, 18, 0, 1),
            location: '하이픈 3F ROUND'
        }),
        buildProgram({
            source: boardGame,
            id: `${TUTORIAL_PROGRAM_PREFIX}open-board-game`,
            title: '보드게임 할 사람!',
            description: '신청 없이 운영 시간에 자유롭게 참여할 수 있는 오픈 프로그램입니다.',
            date: nextWeekdayAt(6, 14, 0),
            location: '하이픈 2F SQUARE',
            recruiting: false
        }),
        buildProgram({
            source: mschChallenge,
            id: `${TUTORIAL_PROGRAM_PREFIX}challenge`,
            title: 'HAIFN CHALLENGE',
            description: '우리는 서로 얼마나 연결되어 있나요? 매주 함께 예배하고 훈련하며 연결되는 즐거움을 경험해봅시다.',
            shortDescription: '',
            date: nextWeekdayAt(1, 10, 0, 1),
            location: '온라인 · 하이픈',
            challenge: true
        })
    ];
};

export const isTutorialProgram = (programOrId) => {
    const id = typeof programOrId === 'string' ? programOrId : programOrId?.id;
    return Boolean(id && String(id).startsWith(TUTORIAL_PROGRAM_PREFIX));
};

export const buildTutorialNotice = () => ({
    id: TUTORIAL_NOTICE_ID,
    title: '센터 이용 안내',
    category: CATEGORIES.NOTICE,
    content: '<p>센터 운영 시간과 휴관 일정, 새로운 프로그램 소식을 홈의 공지사항에서 확인할 수 있어요.</p><p>게시글을 끝까지 읽고 이모지 반응과 댓글을 직접 남겨 보세요.</p>',
    created_at: new Date().toISOString(),
    is_sticky: true,
    is_recruiting: false,
    images: [],
    tutorial_mode: true,
    tutorial_notice: true,
    view_count: 0
});

export const isTutorialNotice = (noticeOrId) => {
    const id = typeof noticeOrId === 'string' ? noticeOrId : noticeOrId?.id;
    return id === TUTORIAL_NOTICE_ID || Boolean(typeof noticeOrId === 'object' && noticeOrId?.tutorial_notice);
};
