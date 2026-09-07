import React, { useRef, useState } from 'react';
import { ArrowLeft, Edit2, Trash2, Share, X, Download, Copy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const NoticeHeader = ({
    onClose,
    isAdmin,
    fromAdmin,
    isEditing,
    setIsEditing,
    handleSave,
    handleDelete,
    noticeId,
    shareTitle,
    shareSchedule,
    shareLocation
}) => {
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const qrCanvasRef = useRef(null);
    const getShareLink = () => `${window.location.origin}/p/${noticeId}`;
    const getShareText = () => [
        shareTitle || 'SCI CENTER 프로그램',
        shareSchedule ? `일정: ${shareSchedule}` : null,
        `장소: ${shareLocation || '미정'}`,
        '프로그램 내용을 확인하고 신청해 보세요!'
    ].filter(Boolean).join('\n');

    const shareNotice = async () => {
        const link = getShareLink();
        if (!navigator.share) {
            await copyShareLink();
            return;
        }

        try {
            await navigator.share({
                title: shareTitle || 'SCI CENTER 프로그램',
                text: getShareText(),
                url: link
            });
        } catch (err) {
            if (err?.name !== 'AbortError') console.error('Failed to share notice:', err);
        }
    };

    const copyShareLink = async () => {
        const link = getShareLink();
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(link);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = link;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            alert('공유 링크가 클립보드에 복사되었습니다!');
        } catch (err) {
            console.error('Failed to copy notice link:', err);
            alert('링크 복사에 실패했습니다.');
        }
    };

    const downloadQr = () => {
        const canvas = qrCanvasRef.current;
        if (!canvas) return;

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `SCI-CENTER-post-${noticeId}-QR.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
        <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-50 shrink-0">
            <div className="flex items-center gap-3">
                <button onClick={onClose} className="-ml-2 p-2 hover:bg-gray-50 rounded-full transition">
                    <ArrowLeft size={24} className="text-gray-900" />
                </button>
                <div>
                    <div className="font-bold text-sm text-gray-900">{isEditing ? '게시물 수정' : '게시물'}</div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {!isEditing && noticeId && (
                    <>
                        <button 
                            onClick={() => setIsShareModalOpen(true)}
                            className="p-2 hover:bg-gray-50 rounded-full transition text-gray-500"
                            title="공유하기"
                        >
                            <Share size={20} />
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-2 hover:bg-gray-50 rounded-full transition text-gray-500"
                                title="수정하기"
                            >
                                <Edit2 size={20} />
                            </button>
                        )}
                    </>
                )}
                {isAdmin && isEditing && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsEditing(false)} className="text-gray-500 text-sm font-medium px-2 py-1">취소</button>
                        <button type="submit" form="write-form" className="text-blue-600 font-bold text-sm px-3 py-1 bg-blue-50 rounded-lg">저장</button>
                    </div>
                )}
            </div>
        </div>
        {isShareModalOpen && (
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
                onClick={() => setIsShareModalOpen(false)}
            >
                <div
                    className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">게시물 공유</h2>
                            <p className="mt-1 text-xs font-semibold text-gray-400">QR을 스캔하면 이 게시물로 바로 연결됩니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsShareModalOpen(false)}
                            className="-mr-2 -mt-2 rounded-full p-2 text-gray-400 hover:bg-gray-100"
                            aria-label="공유 창 닫기"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex justify-center rounded-3xl border border-slate-100 bg-slate-50 p-5">
                        <div className="rounded-2xl bg-white p-3 shadow-sm">
                            <QRCodeCanvas
                                ref={qrCanvasRef}
                                value={getShareLink()}
                                size={220}
                                level="H"
                                includeMargin
                            />
                        </div>
                    </div>

                    <p className="mt-4 truncate rounded-xl bg-gray-50 px-3 py-2 text-center text-[11px] font-medium text-gray-500">
                        {getShareLink()}
                    </p>

                    <button
                        type="button"
                        onClick={shareNotice}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                    >
                        <Share size={16} /> 공유하기
                    </button>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={copyShareLink}
                            className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                        >
                            <Copy size={16} /> 링크 복사
                        </button>
                        <button
                            type="button"
                            onClick={downloadQr}
                            className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                        >
                            <Download size={16} /> QR 다운로드
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default NoticeHeader;
