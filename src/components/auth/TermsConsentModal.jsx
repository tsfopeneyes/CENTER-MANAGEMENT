import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle } from 'lucide-react';

const TermsConsentModal = ({ isOpen, onClose, onAgree, isKiosk = false }) => {
    const [agreements, setAgreements] = useState({
        art1: false,
        art2: false,
        art3: false,
        art4: false
    });

    const isAllAgreed = agreements.art1 && agreements.art2 && agreements.art3 && agreements.art4;

    const handleAllAgree = () => {
        setAgreements({ art1: true, art2: true, art3: true, art4: true });
    };

    const toggleAgreement = (art) => {
        setAgreements(prev => ({ ...prev, [art]: !prev[art] }));
    };

    const handleComplete = () => {
        if (isAllAgreed) {
            onAgree(agreements);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={`bg-white w-full max-w-2xl rounded-3xl p-5 md:p-7 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden ${isKiosk ? 'sm:p-8 sm:rounded-[2.5rem] max-w-3xl' : ''}`}
            >
                <div className="flex justify-between items-center mb-4 shrink-0 border-b border-gray-100 pb-3">
                    <h3 className={`text-xl font-black text-gray-800 tracking-tight ${isKiosk ? 'sm:text-2xl' : ''}`}>이용 약관 및 개인정보 수집 동의</h3>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                        <X size={22} />
                    </button>
                </div>

                {/* All Agree Button at Top */}
                <button
                    type="button"
                    onClick={handleAllAgree}
                    className={`mb-4 w-full py-3.5 rounded-2xl flex items-center justify-center gap-3 transition-all shrink-0 ${isAllAgreed
                        ? 'bg-[#E63946] text-white shadow-lg hover:bg-[#D62839]'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        } font-black text-base md:text-lg`}
                >
                    <CheckCircle size={22} />
                    [전체 동의] 모든 항목에 동의합니다
                </button>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-sm text-gray-600 leading-relaxed space-y-6 min-h-0">
                    {/* Article 1 */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-black text-gray-900 border-l-4 border-[#E63946] pl-3">제1조 회원 가입 약관</h4>
                        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                            <p className="font-bold">제1조 (목적)</p>
                            <p>본 약관은 (재)더작은재단이 운영하는 지역 거점 청소년 복합문화예술센터(이하 “센터”)의 서비스 이용과 관련하여 회원과 센터 간 권리, 의무 및 책임사항을 규정함을 목적으로 합니다. 본 약관은 센터가 제공하는 모든 서비스에 적용됩니다.</p>

                            <p className="font-bold mt-4">제2조 (정의)</p>
                            <p>① “센터”란 (재)더작은재단이 운영하는 청소년의 문화예술 교육, 창작, 교류 활동을 지원하는 지역 거점 복합문화예술공간 및 관련 서비스를 말합니다.</p>
                            <p>② “회원”이란 본 약관에 동의하고 가입 절차를 완료하여 서비스를 이용하는 자를 말합니다.</p>
                            <p>③ “서비스”란 공간 이용, 프로그램 참여 및 센터가 제공하는 모든 활동을 말합니다.</p>
                            <p>④ “보호자”란 만 14세 미만 회원의 법정대리인을 말합니다.</p>

                            <p className="font-bold mt-4">제3조 (약관의 효력 및 변경)</p>
                            <p>① 본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.</p>
                            <p>② 센터는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있습니다.</p>
                            <p>③ 회원에게 불리한 변경이 있는 경우 시행 30일 전에 공지합니다.</p>

                            <p className="font-bold mt-4">제4조 (회원가입)</p>
                            <p>① 회원가입은 디지털 가입 절차에서 필수 정보 입력 및 동의 완료 시 성립합니다.</p>
                            <p>② 만 14세 미만은 보호자의 회원가입동의서를 서면으로 제출 한 후 가입할 수 있습니다.</p>
                            <p>③ 타인의 정보를 도용하여 가입한 경우 센터는 회원 자격을 제한하거나 취소할 수 있습니다.</p>
                            <p>④ 센터는 운영상 필요하다고 판단되는 경우 가입 승인을 제한할 수 있습니다.</p>

                            <p className="font-bold mt-4">제5조 (회원의 의무)</p>
                            <p>① 회원은 센터 이용 시 안전 수칙 및 운영 규정을 준수하여야 합니다.</p>
                            <p>② 회원은 타인의 권리를 침해하거나 센터 운영을 방해하는 행위를 하여서는 아니 됩니다.</p>
                            <p>③ 회원은 시스템을 부정 이용하거나 서비스 운영을 방해하여서는 아니 됩니다.</p>
                            <p>④ 회원은 시설 또는 물품을 훼손하거나 분실한 경우 그 손해를 배상하여야 합니다.</p>

                            <p className="font-bold mt-4">제6조 (서비스 이용 제한)</p>
                            <p>① 센터는 안전 확보 또는 운영상 필요하다고 판단되는 경우 서비스 이용을 제한할 수 있습니다.</p>
                            <p>② 센터는 천재지변, 불가항력적 사유 또는 회원의 귀책사유로 발생한 손해에 대하여 책임을 지지 않습니다.</p>

                            <p className="font-bold mt-4">제7조 (기록 및 초상권 활용)</p>
                            <p>① 센터는 프로그램 운영 과정에서 회원의 활동 모습, 음성, 영상 및 창작물을 촬영 또는 기록할 수 있으며 이에 대한 동의는 서비스 이용의 필수 조건입니다.</p>
                            <p>② 촬영 또는 기록된 자료는 센터 공식 매체, 홍보물 및 결과 보고 자료, 아카이브 구축 등에 활용될 수 있습니다.</p>
                            <p>③ 회원 또는 보호자는 기록물 활용 중단을 요청할 수 있으며 요청 이후 신규 활용은 중단됩니다.</p>
                            <p>④ 이미 제작된 인쇄물 및 보도자료는 삭제가 제한될 수 있습니다.</p>

                            <p className="font-bold mt-4">제8조 (분실물 처리)</p>
                            <p>① 귀중품은 습득일로부터 7일 보관 후 관할 경찰서에 인계합니다.</p>
                            <p>② 일반 물품은 1개월 보관 후 폐기합니다.</p>
                            <p>③ 음식물 등 보관이 곤란한 물품은 즉시 폐기합니다.</p>

                            <p className="font-bold mt-4">제9조 (준거법 및 관할)</p>
                            <p>본 약관과 관련하여 발생한 분쟁은 대한민국 법령에 따르며 관할 법원은 센터 소재지 관할 법원으로 합니다.</p>

                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="font-bold">부칙</p>
                                <p>본 약관은 공지일부터 시행합니다.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleAgreement('art1')}
                            className={`w-full py-3 rounded-xl font-bold border transition ${agreements.art1 ? 'bg-[#E63946]/10 border-[#E63946]/30 text-[#E63946]' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        >
                            {agreements.art1 ? '✓ 제1조 동의함' : '제1조 동의합니다'}
                        </button>
                    </div>

                    {/* Article 2 */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-black text-gray-900 border-l-4 border-[#E63946] pl-3">제2조 개인정보 처리 방침</h4>
                        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                            <p className="font-bold">제1조 (개인정보 처리 목적)</p>
                            <p>센터는 다음 목적을 위하여 개인정보를 처리합니다.</p>
                            <ul className="list-inside list-decimal ml-2 space-y-1">
                                <li>회원 가입 및 본인 확인</li>
                                <li>서비스 제공 및 운영 관리</li>
                                <li>서비스 접속 상태 확인 및 계정 보안</li>
                                <li>센터 방문·프로그램 참여 기록 분석 및 서비스 개선</li>
                            </ul>

                            <p className="font-bold mt-4">제2조 (수집하는 개인정보 항목)</p>
                            <p>① 센터는 다음 개인정보를 수집합니다.</p>
                            <ul className="list-inside list-decimal ml-2 space-y-1">
                                <li>정식 회원 필수 항목: 이름, 성별, 회원 구분(청소년 또는 졸업생), 학교, 생년월일, 연락처, 비밀번호, 학교 스쿨처치 참여 여부.</li>
                                <li>게스트 방문·프로그램 신청 필수 항목: 이름, 학교, 생년월일 및 신청 시 필요한 연락처. 방문자·신청자 확인, 방문·프로그램 운영 기록 및 연령대 분석에 이용합니다.</li>
                                <li>선택 항목: 출석교회.</li>
                                <li>만 14세 미만 추가 항목: 보호자 이름, 보호자 연락처, 보호자와의 관계.</li>
                            </ul>
                            <p>② 서비스 이용 과정에서 다음 정보가 자동 수집될 수 있습니다.</p>
                            <ul className="list-inside list-disc ml-2 space-y-1 text-gray-600 mt-1">
                                <li>최근 웹 접속 일시: 로그인된 이용자가 웹앱을 열 때 갱신되는 마지막 접속 시각입니다. 별도의 웹 접속 이력은 누적하지 않습니다.</li>
                                <li>서비스 이용 과정에서 프로그램 운영 및 기록을 위하여 촬영된 사진, 영상, 음성 등 활동 기록 자료가 생성될 수 있습니다.</li>
                            </ul>

                            <p className="font-bold mt-4">제3조 (개인정보의 보유 및 이용 기간)</p>
                            <p>① 개인정보는 회원 탈퇴 시까지 보유합니다.</p>
                            <p>② 다음의 경우 관련 법령에서 정한 기간 동안 보관합니다.</p>
                            <ul className="list-inside list-decimal ml-2 space-y-1">
                                <li>계약 관련 기록: 5년</li>
                                <li>분쟁 처리 기록: 3년</li>
                                <li>최근 웹 접속 일시: 마지막 접속일로부터 3개월 후 삭제</li>
                            </ul>

                            <p className="font-bold mt-4">제4조 (개인정보의 제3자 제공)</p>
                            <p>센터는 법령 근거 또는 이용자 동의가 있는 경우에만 개인정보를 제3자에게 제공합니다.</p>

                            <p className="font-bold mt-4">제5조 (개인정보의 파기)</p>
                            <p>① 센터는 개인정보의 보유기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 해당 개인정보를 파기합니다.</p>
                            <p>② 전자적 파일 형태의 개인정보는 복구 또는 재생이 불가능한 기술적 방법으로 삭제합니다.</p>
                            <p>③ 종이 문서에 기록된 개인정보는 분쇄하거나 소각하여 파기합니다.</p>
                            <p>④ 개인정보 파기 절차 및 방법은 관련 법령에서 정한 기준을 따릅니다.</p>

                            <p className="font-bold mt-4">제6조 (이용자의 권리)</p>
                            <p>회원 및 보호자는 언제든 개인정보의 열람, 정정, 삭제 및 처리 정지를 요구할 수 있습니다.</p>

                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="font-bold">제7조 (개인정보 보호책임자)</p>
                                <ul className="list-none space-y-1">
                                    <li>성명: 오승환</li>
                                    <li>직위: 대표이사</li>
                                    <li>연락처: 02-743-1801, support@thesmallfoundation.org</li>
                                </ul>
                                <p className="text-xs text-gray-500 mt-2">※ 개인정보 보호 담당부서로 연결됩니다.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleAgreement('art2')}
                            className={`w-full py-3 rounded-xl font-bold border transition ${agreements.art2 ? 'bg-[#E63946]/10 border-[#E63946]/30 text-[#E63946]' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        >
                            {agreements.art2 ? '✓ 제2조 동의함' : '제2조 동의합니다'}
                        </button>
                    </div>

                    {/* Article 3 */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-black text-gray-900 border-l-4 border-[#E63946] pl-3">제3조 개인정보 수집 및 이용 동의</h4>
                        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                            <p>센터는 회원 가입 및 서비스 제공을 위하여 다음과 같이 개인정보를 수집·이용합니다.</p>

                            <p className="font-bold mt-4 text-[#E63946]">수집 항목</p>
                            <p>필수: 이름, 성별, 회원 구분(청소년 또는 졸업생), 학교, 생년월일, 연락처, 비밀번호, 학교 스쿨처치 참여 여부, 최근 웹 접속 일시<br />선택: 출석교회<br />만 14세 미만: 보호자 이름, 보호자 연락처, 보호자와의 관계</p>

                            <p className="font-bold mt-4 text-[#E63946]">이용 목적</p>
                            <p>회원 관리, 서비스 제공, 서비스 접속 상태 확인 및 계정 보안, 센터 방문·프로그램 참여 기록 분석 및 프로그램 개선</p>

                            <p className="font-bold mt-4 text-[#E63946]">보유 기간</p>
                            <p>회원 정보는 회원 탈퇴 시까지 보관합니다. 최근 웹 접속 일시는 마지막 접속일로부터 3개월 후 삭제합니다. 다만 관련 법령에 따라 보관이 필요한 정보는 해당 기간 동안 보관합니다.</p>

                            <p className="font-bold mt-4 text-[#E63946]">동의 거부 권리</p>
                            <p>이용자는 개인정보 수집 및 이용 동의를 거부할 권리가 있으나 필수 정보 미동의 시 서비스 이용이 제한됩니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleAgreement('art3')}
                            className={`w-full py-3 rounded-xl font-bold border transition ${agreements.art3 ? 'bg-[#E63946]/10 border-[#E63946]/30 text-[#E63946]' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        >
                            {agreements.art3 ? '✓ 제3조 동의함' : '제3조 동의합니다'}
                        </button>
                    </div>

                    {/* Article 4 */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-black text-gray-900 border-l-4 border-[#E63946] pl-3">제4조 초상권 및 활동 기록 이용 동의</h4>
                        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                            <p>센터는 프로그램 운영을 위하여 회원 활동 기록물을 활용합니다.</p>

                            <p className="font-bold mt-4 text-[#E63946]">활용 범위</p>
                            <p>공식 홈페이지, SNS, 홍보물, 보도자료, 아카이브 자료</p>

                            <p className="font-bold mt-4 text-[#E63946]">활용 목적</p>
                            <p>활동 기록, 프로그램 소개 및 홍보</p>

                            <p className="font-bold mt-4 text-[#E63946]">보유 기간</p>
                            <p>동의 철회 또는 목적 달성 시까지</p>

                            <p className="font-bold mt-4 text-[#E63946]">안내</p>
                            <p>센터는 프로그램 운영 과정에서 회원의 활동 모습, 음성, 영상 및 창작물을 촬영 또는 기록할 수 있으며 이에 대한 동의는 서비스 이용을 위한 필수 조건입니다. 이용자가 이에 동의하지 않을 경우 서비스 이용이 제한될 수 있습니다. 동의 후 철회 요청 시 신규 활용은 중단되나 이미 제작된 인쇄물 등은 삭제가 제한될 수 있습니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleAgreement('art4')}
                            className={`w-full py-3 rounded-xl font-bold border transition ${agreements.art4 ? 'bg-[#E63946]/10 border-[#E63946]/30 text-[#E63946]' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        >
                            {agreements.art4 ? '✓ 제4조 동의함' : '제4조 동의합니다'}
                        </button>
                    </div>
                </div>

                <div className="pt-3 mt-3 border-t border-gray-100 shrink-0 flex gap-3">
                    <button
                        type="button"
                        onClick={handleComplete}
                        className={`flex-1 py-3.5 rounded-2xl font-black text-base md:text-lg transition-all ${isAllAgreed
                            ? 'bg-[#E63946] text-white shadow-xl hover:bg-[#D62839]'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        동의 완료 및 창 닫기
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

export default TermsConsentModal;
