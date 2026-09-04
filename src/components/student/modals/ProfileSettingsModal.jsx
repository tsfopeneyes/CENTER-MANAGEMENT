import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Image as ImageIcon, ZoomIn, RotateCw, BookOpen } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../../../utils/imageUtils';
import { hashPassword } from '../../../utils/hashUtils';
import useModalClose from '../../../hooks/useModalClose';
import { getAccountAuthClient, isAccountAuthEnabled } from '../../../auth/accountAuthRuntime';

const ProfileSettingsModal = ({ 
    user, 
    setShowProfileSettings, 
    updateProfile, 
    withdrawMembership,
    profileLoadingState,
    onStartTutorial
}) => {
    useModalClose(true, () => setShowProfileSettings(false));
    const [profileImage, setProfileImage] = useState(null);
    const [profilePreview, setProfilePreview] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [school, setSchool] = useState(user?.school || '');
    const [church, setChurch] = useState(user?.church || '');
    const [isSchoolChurch, setIsSchoolChurch] = useState(user?.preferences?.is_school_church ?? false);
    const [bio, setBio] = useState(user?.bio || '');
    const isStaff = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'staff' || user?.user_group?.toLowerCase() === 'staff' || user?.user_group === '관리자';
    const isAdminUser = user?.role?.toLowerCase() === 'admin' ||
        user?.role?.toLowerCase() === 'staff' ||
        user?.user_group?.toLowerCase() === 'admin' ||
        user?.user_group?.toLowerCase() === 'staff' ||
        user?.user_group === '관리자';
    const canAccessTutorial = isAdminUser || user?.name?.replace('(guest)', '').trim() === '김학생';

    const [showCropModal, setShowCropModal] = useState(false);
    const [photoURL, setPhotoURL] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const handleProfileImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhotoURL(URL.createObjectURL(file));
            setShowCropModal(true);
            setZoom(1);
            setRotation(0);
            setCrop({ x: 0, y: 0 });
        }
    };

    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleCropSave = async () => {
        try {
            if (!croppedAreaPixels) {
                alert('이미지를 로드하는 중입니다. 잠시 후 다시 시도해주세요.');
                return;
            }
            const croppedImageBlob = await getCroppedImg(photoURL, croppedAreaPixels, rotation);
            if (!croppedImageBlob) {
                alert('이미지 크롭 실패');
                return;
            }
            const file = new File([croppedImageBlob], "profile_cropped.jpg", { type: "image/jpeg" });
            setProfileImage(file);
            setProfilePreview(URL.createObjectURL(file));
            setShowCropModal(false);
        } catch (e) {
            console.error(e);
            alert('이미지 크롭 실패: ' + e.message);
        }
    };

    const handleSaveProfile = async () => {
        const updates = {};
        if (newPassword) {
            if (newPassword.length < 6) {
                alert('비밀번호는 6자리 이상이어야 합니다.');
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('비밀번호 확인이 일치하지 않습니다.');
                return;
            }
            if(isAccountAuthEnabled()){
                try{await getAccountAuthClient().password({profileId:user.id,newPassword});}
                catch(error){alert('비밀번호 변경 실패: '+(error.message||'잠시 후 다시 시도해주세요.'));return;}
            } else {
                const hashedPassword = await hashPassword(newPassword);
                updates.password = hashedPassword;
            }
        }

        if (school !== user?.school) updates.school = school;
        if (church !== user?.church) updates.church = church;
        if (isSchoolChurch !== (user?.preferences?.is_school_church ?? false)) {
            updates.preferences = { ...(user?.preferences || {}), is_school_church: isSchoolChurch };
        }
        if (bio !== user?.bio) updates.bio = bio;

        const result = await updateProfile(updates, profileImage);

        if (result.success) {
            alert('프로필이 업데이트되었습니다.');
            setShowProfileSettings(false);
        } else {
            alert('프로필 저장 실패: ' + result.error);
        }
    };

    return (
        <>
            <motion.div
                key="profile-settings"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed inset-0 z-[110] bg-white flex flex-col sm:rounded-t-3xl sm:top-10 shadow-2xl pb-20 w-full max-w-md mx-auto left-0 right-0"
            >
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-20">
                    <button onClick={() => setShowProfileSettings(false)} className="p-2 hover:bg-gray-100 rounded-full">
                        <X size={24} className="text-gray-600" />
                    </button>
                    <h3 className="font-bold text-lg">프로필 설정</h3>
                    <button onClick={handleSaveProfile} disabled={profileLoadingState} className="text-blue-600 font-bold px-2 disabled:text-gray-300">
                        {profileLoadingState ? '...' : '저장'}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            {profilePreview || user?.profile_image_url ? (
                                <img src={profilePreview || user?.profile_image_url} alt="Profile" className="w-32 h-32 rounded-full object-cover border-4 border-gray-50 shadow-sm" />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center">
                                    <User size={48} className="text-gray-300" />
                                </div>
                            )}
                            <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 shadow-md transition">
                                <ImageIcon size={16} />
                                <input type="file" accept="image/*" className="hidden" onChange={handleProfileImageSelect} />
                            </label>
                        </div>
                        <p className="text-sm text-gray-400">프로필 사진을 변경하려면 카메라 아이콘을 누르세요</p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-800 border-b pb-2">소속 정보</h4>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">학교</label>
                            <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="학교 이름을 입력하세요 (예: 00고등학교)" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-base font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">출석교회</label>
                            <input type="text" value={church} onChange={(e) => setChurch(e.target.value)} placeholder="교회 이름을 입력하세요 (예: 00교회)" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-base font-bold" />
                        </div>
                        <div className="pt-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">지금 스쿨처치에 참여하고 있나요?</label>
                            <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                                <button
                                    onClick={() => setIsSchoolChurch(true)}
                                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${isSchoolChurch ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    네
                                </button>
                                <button
                                    onClick={() => setIsSchoolChurch(false)}
                                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${!isSchoolChurch ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    아니요
                                </button>
                            </div>
                        </div>
                    </div>

                    {onStartTutorial && canAccessTutorial && (
                    <div className="space-y-3">
                        <h4 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                            <BookOpen size={18} className="text-blue-600" />
                            센터 이용 안내
                        </h4>
                        <button
                            type="button"
                            onClick={() => onStartTutorial?.()}
                            className="w-full flex items-center justify-between bg-blue-50 hover:bg-blue-100/70 p-4 rounded-2xl border border-blue-100 text-left transition-colors"
                        >
                            <div>
                                <p className="font-bold text-sm text-blue-900">센터 이용 튜토리얼 다시 보기</p>
                                <p className="text-xs text-blue-700 mt-0.5">체크인부터 하이픈 스토어까지 직접 체험해요</p>
                            </div>
                            <BookOpen size={18} className="text-blue-600" />
                        </button>
                    </div>
                    )}

                    {isStaff && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 border-b pb-2">스탭 소개글 💬</h4>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">커피챗 한 줄 소개</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="커피챗 신청 시 학생들에게 노출될 나만의 소개글을 적어주세요."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold h-24 resize-none"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 pb-6">
                        <h4 className="font-bold text-gray-800 border-b pb-2">비밀번호 변경</h4>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">새 비밀번호 (6자리 이상)</label>
                            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="변경할 비밀번호를 입력하세요" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-base" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">새 비밀번호 확인</label>
                            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="비밀번호를 다시 입력하세요" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-base" />
                        </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-gray-100 pb-8">
                        <h4 className="font-bold text-red-600 text-sm">회원 탈퇴</h4>
                        <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                            탈퇴 시 회원 정보, 로그인 정보 및 연락처가 즉시 파기되며 복구할 수 없습니다.
                        </p>
                        <button
                            type="button"
                            onClick={async () => {
                                const confirmFirst = window.confirm(
                                    `정말로 회원 탈퇴를 진행하시겠습니까?\n\n탈퇴 시 연락처 및 비밀번호 등의 개인정보는 영구 파기되며 다시 로그인할 수 없습니다.`
                                );
                                if (!confirmFirst) return;

                                if (withdrawMembership) {
                                    const res = await withdrawMembership(user);
                                    if (res?.success) {
                                        alert('회원 탈퇴가 완료되었습니다.');
                                        window.location.href = '/';
                                    } else {
                                        alert('탈퇴 실패: ' + (res?.error || '오류가 발생했습니다.'));
                                    }
                                }
                            }}
                            disabled={profileLoadingState}
                            className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl font-bold text-xs transition-all active:scale-98 disabled:opacity-50"
                        >
                            회원 탈퇴하기
                        </button>
                    </div>
                </div>
            </motion.div>

            {showCropModal && (
                <div className="fixed inset-0 z-[150] bg-black flex flex-col animate-fade-in pb-20">
                    <div className="flex-1 relative bg-black">
                        <Cropper
                            image={photoURL}
                            crop={crop}
                            zoom={zoom}
                            rotation={rotation}
                            aspect={1}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                            onRotationChange={setRotation}
                            cropShape="round"
                            showGrid={false}
                        />
                    </div>
                    <div className="bg-gray-900 p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <ZoomIn className="text-gray-400" size={20} />
                            <span className="text-white text-xs w-10">Zoom</span>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <RotateCw className="text-gray-400" size={20} />
                            <span className="text-white text-xs w-10">Rot</span>
                            <input
                                type="range"
                                value={rotation}
                                min={0}
                                max={360}
                                step={1}
                                onChange={(e) => setRotation(Number(e.target.value))}
                                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="flex gap-3 justify-end mt-2">
                            <button
                                onClick={() => setShowCropModal(false)}
                                className="px-6 py-3 text-white bg-gray-700 rounded-xl hover:bg-gray-600 transition font-bold"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleCropSave}
                                className="px-6 py-3 text-white bg-blue-600 rounded-xl hover:bg-blue-500 font-bold transition shadow-lg shadow-blue-900/20"
                            >
                                완료
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
export default ProfileSettingsModal;
