import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, X } from 'lucide-react';

const staticTargetByStep = {
    checkinSuccess: '[data-tour="visit-status"]',
    checkoutSuccess: '[data-tour="visit-status"]',
    home: '[data-tour="home-notice-card"]',
    homeOpenStatus: '[data-tour="home-open-status"]',
    homeCoffeeChat: '[data-tour="home-coffee-chat"]',
    noticeComment: '[data-tour="tutorial-notice-comment-input"]',
    noticeCommentResult: '[data-tour="tutorial-comment-result"]',
    // 센터 탭은 하단 네비게이션의 실제 버튼 하나만 대상으로 삼습니다.
    // 여러 후보를 묶으면 숨겨진/중복된 네비게이션을 먼저 잡아 위치가 어긋날 수 있습니다.
    centerNav: '[data-tour-center="nav-center"]',
    programTypes: '[data-tour="tutorial-program-section"]',
    openSelect: '[data-tour="tutorial-open-card-0"]',
    challengeSelect: '[data-tour="tutorial-challenge-card-0"]',
    challengeDetail: '[data-tour="tutorial-challenge-missions"]',
    challengeMissionDetail: '[data-tour="tutorial-challenge-mission-detail"]',
    contentIntro: '[data-tour="tutorial-content-section"]',
    rentalIntro: '[data-tour="tutorial-rental-section"]',
    calendar: '[data-tour="tutorial-calendar-event"]',
    haifnNav: '[data-tour="nav-haifn"]',
    store: '[data-tour="tutorial-store-list"]',
    storeResultCard: '[data-tour="tutorial-store-result"]'
};

const selectorFor = (session) => {
    if (session.step === 'programCard') return `[data-tour="tutorial-program-card-${session.programCardIndex || 0}"]`;
    if (session.step === 'openSelect') return `[data-tour="tutorial-open-card-${session.openCardIndex || 0}"]`;
    if (session.step === 'challengeSelect') return `[data-tour="tutorial-challenge-card-${session.challengeCardIndex || 0}"]`;
    if (session.step === 'contentCard') return `[data-tour="tutorial-content-card-${session.contentCardIndex || 0}"]`;
    if (session.step === 'rentalCard') return `[data-tour="tutorial-rental-card-${session.rentalCardIndex || 0}"]`;
    return staticTargetByStep[session.step];
};

const readingSteps = new Set([
    'noticeRead',
    'programSelect', 'programDetail', 'programApplied',
    'openDetail',
    'rentalSelect', 'rentalDetail',
    'calendarDetail',
    'storeConfirm', 'storeResult'
]);

const copyFor = (session, targetMeta) => {
    const selectedTitle = session.selectedProgramTitle || '선택한 프로그램';
    const itemName = session.purchasedItem?.name || '선택한 아이템';
    const targetLabel = targetMeta.label || '';
    const isLastTarget = targetMeta.count > 0 && targetMeta.index >= targetMeta.count - 1;
    return {
        start: { title: '센터 이용 방법을 직접 체험해 볼까요?', body: '실제 화면을 사용하면서 QR 체크인부터 프로그램, 캘린더와 하이픈 스토어까지 차례대로 알아봐요.', action: '튜토리얼 시작하기', actionId: 'show-checkin' },
        checkinIntro: { title: '센터에 도착하면 체크인 QR을 스캔해요', body: '휴대전화 기본 카메라로 센터에 비치된 QR을 스캔하고 체크인을 완료하세요. 완료된 방문 기록이 확인되면 튜토리얼이 자동으로 이어집니다.', action: '체크인하기', actionId: 'wait-checkin', secondary: '지금은 센터가 아니에요 · 건너뛰기', secondaryId: 'skip-checkin' },
        checkinWait: { title: '체크인 완료를 기다리고 있어요', body: 'QR 화면에서 체크인을 마치면 이 화면으로 돌아왔을 때 자동으로 확인해요. 앱이 다시 열려도 진행 단계는 유지됩니다.', waiting: true, secondary: '지금은 체험하기 어려워요 · 건너뛰기', secondaryId: 'skip-checkin' },
        checkinSuccess: { title: session.checkinMode === 'actual' ? '실제 체크인이 확인됐어요' : '체크인 후에는 이렇게 바뀌어요', body: session.checkinMode === 'actual' ? '방문 기록이 확인되어 현재 센터를 이용 중인 상태예요.' : '센터 밖에서 건너뛴 경우에는 실제 방문 기록을 만들지 않고 이용 중 상태만 예시로 보여드려요.', action: '체크아웃 알아보기', actionId: 'show-checkout', status: 'active' },
        checkoutIntro: { title: '이용을 마칠 때도 같은 QR을 다시 스캔해요', body: session.checkinMode === 'actual' ? '별도의 퇴실하기 버튼은 없어요. 센터의 체크인 QR을 다시 스캔해 체크아웃을 완료하면 자동으로 확인합니다.' : '별도의 퇴실하기 버튼은 없어요. 실제 이용 중이라면 센터 QR을 다시 스캔하고, 지금은 상태 예시로 이어갈 수 있어요.', action: '체크아웃하기', actionId: session.checkinMode === 'actual' ? 'wait-checkout' : 'skip-checkout', secondary: session.checkinMode === 'actual' ? '지금은 나갈 수 없어요 · 건너뛰기' : null, secondaryId: session.checkinMode === 'actual' ? 'skip-checkout' : null },
        checkoutWait: { title: '체크아웃 완료를 기다리고 있어요', body: '같은 센터 QR을 다시 스캔해 퇴실 처리를 마쳐 주세요. 체크아웃 기록이 확인되면 자동으로 다음 단계로 넘어갑니다.', waiting: true, secondary: '지금은 체험하기 어려워요 · 건너뛰기', secondaryId: 'skip-checkout' },
        checkoutSuccess: { title: session.checkoutMode === 'actual' ? '실제 체크아웃이 확인됐어요' : '체크아웃 후에는 이렇게 바뀌어요', body: '센터 이용이 완료된 상태예요. 다음 방문 때 다시 QR을 스캔하면 새로운 체크인이 시작됩니다.', action: '홈 화면 살펴보기', actionId: 'show-home', status: 'complete' },
        home: { title: '공지사항을 열어 내용을 확인해 보세요', body: '홈에는 센터 운영 안내와 학생에게 필요한 소식이 표시돼요. 강조된 실제 공지 카드를 눌러 전체 내용을 읽어 보세요.' },
        homeOpenStatus: { title: '센터 오픈 현황을 확인해요', body: '센터가 오늘 운영 중인지, 운영 시간과 현재 이용 가능한 상태를 홈의 오픈 현황 카드에서 확인할 수 있어요.', action: '커피챗 기능 알아보기', actionId: 'show-home-coffee-chat' },
        homeCoffeeChat: { title: '커피챗으로 선생님과 대화할 수 있어요', body: '스처쌤을 눌러 대화 신청 화면을 열어 보세요. 대화 주제와 하고 싶은 말을 적고 커피챗 신청하기를 눌러 보세요.' },
        noticeComment: { title: '이번에는 댓글을 직접 남겨 보세요', body: '댓글 입력창에 원하는 내용을 쓰고 게시를 누르면 작성 결과가 바로 표시돼요. 튜토리얼 댓글은 서버에 저장되지 않아요.' },
        noticeCommentResult: { title: '반응과 댓글이 이렇게 표시돼요', body: '선택한 이모지와 작성한 댓글이 실제 게시글 화면에 표시되는 모습을 확인했어요.', action: '센터 탭 알아보기', actionId: 'show-center-nav' },
        centerNav: { title: '센터 탭을 눌러 보세요', body: '프로그램과 센터 콘텐츠, 공간 이용 기능을 이곳에서 확인할 수 있어요.' },
        programTypes: { title: '프로그램은 참여 방식이 달라요', body: '신청 프로그램은 미리 신청하고, 오픈 프로그램은 신청 없이 참여해요. 챌린지는 기간 동안 미션을 수행하고 인증하는 프로그램이에요.', action: '프로그램 카드 살펴보기', actionId: 'show-program-cards' },
        programCard: {
            title: '신청 프로그램 카드',
            body: '이 카드에서 프로그램 소개와 일정, 장소, 정원을 먼저 확인해 보세요. 카드를 누르면 실제 상세 화면이 열려요.',
            action: null,
            actionId: null
        },
        openSelect: {
            title: `${targetLabel || '오픈 프로그램'} 카드를 눌러 보세요`,
            body: '카드를 눌러 상세 화면을 열고 운영 방식, 시간, 장소를 확인해 보세요.',
            action: null,
            actionId: null
        },
        challengeSelect: {
            title: `${targetLabel || '챌린지'} 카드를 눌러 보세요`,
            body: '챌린지 카드를 열어 기간, 미션, 인증 방법을 확인하세요.',
            action: null,
            actionId: null
        },
        challengeDetail: { title: '미션을 하나 골라 보세요', body: '아래 미션 중 하나를 눌러 미션 내용과 진행 방법을 확인해 보세요.' },
        challengeMissionDetail: { title: '미션 내용을 확인해 보세요', body: '선택한 미션의 장소와 미션 가이드를 확인한 뒤 다음 튜토리얼로 넘어가세요.' },
        contentIntro: { title: '센터 콘텐츠를 살펴보세요', body: '센터에서 이용할 수 있는 콘텐츠와 이용 장소를 확인할 수 있어요.', action: '공간 대여 알아보기', actionId: 'show-rental-cards' },
        contentCard: {
            title: `${targetLabel || '콘텐츠'} 카드`,
            body: '이 카드에서 이용 가능한 콘텐츠 수, 각 품목 이름과 이용 장소를 확인할 수 있어요.',
            action: isLastTarget ? '공간 대여 알아보기' : '다음 콘텐츠 카드',
            actionId: 'next-content-card'
        },
        rentalIntro: { title: '모임에 필요한 공간을 예약할 수 있어요', body: '원하는 공간의 예약 신청 버튼을 눌러 날짜와 이용 정보를 입력해 보세요.', action: null, actionId: null },
        rentalCard: {
            title: '공간 대여를 신청해 보세요',
            body: '원하는 공간의 예약 신청 버튼을 눌러 날짜와 이용 정보를 입력하고 신청 과정을 체험해 보세요.',
            action: null,
            actionId: null
        },
        calendar: { title: '신청한 프로그램이 실제 캘린더에 표시돼요', body: `${selectedTitle} 일정 카드를 눌러 시간과 장소를 다시 확인해 보세요.` },
        haifnNav: { title: '하이픈 탭을 눌러 보세요', body: '하이픈 잔액을 확인하고 원하는 물품을 골라 교환해 보세요. 예시 잔액 50H로 교환 과정을 체험할 수 있어요.' },
        store: { title: '원하는 하이픈 상품을 골라 보세요', body: '상품 카드에서 이름과 필요한 하이픈을 확인하고, 원하는 품목을 눌러 교환을 체험해 보세요.' },
        storeResultCard: { title: `${itemName}의 교환 상태가 카드에 표시됐어요`, body: session.purchasedItem?.requires_approval ? '승인이 필요한 품목은 승인 대기로 표시되고 승인 전에는 하이픈이 차감되지 않아요.' : '교환한 품목에는 체험 교환 완료가 표시되고 예시 잔액도 함께 바뀌어요.', action: '튜토리얼 마치기', actionId: 'finish-tour' },
        complete: { title: '이제 센터를 누릴 준비가 됐어요!', body: '센터에서는 QR로 체크인과 체크아웃을 하고, 홈·센터·캘린더·하이픈 탭을 필요할 때 이용해 보세요.', action: '센터 둘러보기', actionId: 'complete' }
    }[session.step];
};

const StudentGuidedTour = ({ session, onAction, onClose }) => {
    const [targetRect, setTargetRect] = useState(null);
    const [targetMeta, setTargetMeta] = useState({ label: '', index: 0, count: 0 });
    const autoScrolledStepRef = useRef(null);
    const selector = selectorFor(session);
    const isReading = readingSteps.has(session.step);

    useLayoutEffect(() => {
        if (!selector || isReading) {
            setTargetRect(null);
            return undefined;
        }
        let frame;
        const update = () => {
            const target = document.querySelector(selector);
            if (!target) {
                setTargetRect(null);
                frame = window.requestAnimationFrame(update);
                return;
            }
            const rect = target.getBoundingClientRect();
            const style = window.getComputedStyle(target);
            const radius = Math.min(parseFloat(style.borderRadius) || 0, rect.width / 2, rect.height / 2);
            const prefix = session.step === 'programCard' ? 'tutorial-program-card-'
                : session.step === 'openSelect' ? 'tutorial-open-card-'
                    : session.step === 'challengeSelect' ? 'tutorial-challenge-card-'
                        : session.step === 'contentCard' ? 'tutorial-content-card-'
                            : session.step === 'rentalCard' ? 'tutorial-rental-card-' : null;
            const count = prefix ? document.querySelectorAll(`[data-tour^="${prefix}"]`).length : 1;
            const index = session.step === 'programCard' ? (session.programCardIndex || 0)
                : session.step === 'openSelect' ? (session.openCardIndex || 0)
                    : session.step === 'challengeSelect' ? (session.challengeCardIndex || 0)
                        : session.step === 'contentCard' ? (session.contentCardIndex || 0)
                            : session.step === 'rentalCard' ? (session.rentalCardIndex || 0) : 0;
            const label = target.dataset.tourLabel || '';
            setTargetMeta((current) => current.label === label && current.index === index && current.count === count
                ? current
                : { label, index, count });
            const maxBottom = session.step === 'store' ? window.innerHeight - 76 : rect.bottom;
            const nextBottom = Math.min(rect.bottom, maxBottom);
            const nextRect = { selector, top: rect.top, left: rect.left, right: rect.right, bottom: nextBottom, width: rect.width, height: Math.max(0, nextBottom - rect.top), radius };
            setTargetRect((current) => current
                && current.selector === nextRect.selector
                && Math.abs(current.top - nextRect.top) < 0.5
                && Math.abs(current.left - nextRect.left) < 0.5
                && Math.abs(current.width - nextRect.width) < 0.5
                && Math.abs(current.height - nextRect.height) < 0.5
                ? current
                : nextRect);
            frame = window.requestAnimationFrame(update);
        };
        update();
        return () => window.cancelAnimationFrame(frame);
    }, [selector, session.step, session.programCardIndex, session.openCardIndex, session.challengeCardIndex, session.contentCardIndex, session.rentalCardIndex, isReading]);

    useEffect(() => {
        if (!selector || !targetRect || targetRect.selector !== selector) return;
        const stepKey = `${session.step}:${selector}`;
        if (autoScrolledStepRef.current === stepKey) return;
        autoScrolledStepRef.current = stepKey;
        const target = document.querySelector(selector);
        if (!target) return;
        if (targetRect.height > 280 && targetRect.height < window.innerHeight - 190) {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
            window.scrollBy({ top: -72, behavior: 'auto' });
            return;
        }
        if (targetRect.top < 0 || targetRect.bottom > window.innerHeight) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [selector, targetRect, session.step]);

    const content = copyFor(session, targetMeta);
    if (!content || isReading) return null;
    const panelStyle = isReading
        ? { top: 'max(64px, env(safe-area-inset-top))' }
        : targetRect
            ? (targetRect.top > 230 ? { bottom: Math.max(20, window.innerHeight - targetRect.top + 14) } : { top: Math.min(window.innerHeight - 200, targetRect.bottom + 14) })
            : { bottom: 'max(24px, env(safe-area-inset-bottom))' };

    return (
        <div className="fixed inset-0 z-[500] pointer-events-none" role="dialog" aria-label="센터 이용 튜토리얼">
            {!isReading && (targetRect ? (
                <>
                    <svg className="fixed inset-0 h-full w-full pointer-events-none" aria-hidden="true">
                        <defs>
                            <mask id="tour-highlight-mask">
                                <rect width="100%" height="100%" fill="white" />
                                <rect x={targetRect.left} y={targetRect.top} width={targetRect.width} height={targetRect.height} rx={targetRect.radius} fill="black" />
                            </mask>
                        </defs>
                        <rect width="100%" height="100%" fill="rgba(0,0,0,0.70)" mask="url(#tour-highlight-mask)" />
                    </svg>
                </>
            ) : <div className="fixed inset-0 bg-black/70 pointer-events-none" />)}

            <div className="fixed left-3 right-3 z-[510] mx-auto max-h-[calc(100vh-24px)] max-w-md overflow-y-auto rounded-[24px] border border-black/5 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] pointer-events-auto" style={panelStyle}>
                <button onClick={onClose} className="absolute right-4 top-4 p-1 text-tossGrey400" aria-label="튜토리얼 닫기"><X size={18} /></button>
                <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-[#E63946]/10 px-2.5 py-1 text-[10px] font-black text-[#E63946]">센터 이용 체험</span>
                </div>
                <h2 className="pr-7 text-[17px] font-black leading-snug tracking-tight text-tossGrey900">{content.title}</h2>
                <p className="mt-2 text-[13px] font-medium leading-5 text-tossGrey600">{content.body}</p>
                {content.waiting && <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-tossGrey50 py-3 text-xs font-bold text-tossGrey600"><LoaderCircle size={16} className="animate-spin text-[#E63946]" /> 실제 QR 처리 상태 확인 중</div>}
                {content.action ? (
                    <button onClick={() => onAction(content.actionId)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-[#E63946] py-3 text-sm font-black text-white hover:bg-[#D62839]">{content.action}<ChevronRight size={17} /></button>
                ) : null}
                {content.secondary && <button onClick={() => onAction(content.secondaryId)} className="mt-2 w-full py-2 text-xs font-bold text-tossGrey500 underline underline-offset-4">{content.secondary}</button>}
            </div>
        </div>
    );
};

export default StudentGuidedTour;
