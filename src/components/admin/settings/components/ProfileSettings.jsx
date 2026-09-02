import React from 'react';
import { User, Camera } from 'lucide-react';

const ProfileSettings = ({
    currentAdmin,
    profilePreview,
    profileImage,
    newAdminPassword,
    setNewAdminPassword,
    confirmAdminPassword,
    setConfirmAdminPassword,
    profileLoading,
    handleAdminProfileImageSelect,
    handleSaveAdminProfile
}) => {
    return (
        <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#191f28] mb-6 flex items-center gap-2 tracking-tight">
                <User size={20} className="text-[#3182f6]" /> 관리자 프로필
            </h3>

            <div className="flex flex-col items-center gap-6 mb-8">
                <div className="relative group">
                    {profilePreview || currentAdmin?.profile_image_url ? (
                        <img 
                            src={profilePreview || currentAdmin.profile_image_url} 
                            alt="Profile" 
                            className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-gray-50 shadow-md" 
                        />
                    ) : (
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-50">
                            <User size={40} className="text-gray-300" />
                        </div>
                    )}
                    <label className="absolute bottom-0 right-0 p-2 md:p-3 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 shadow-lg transition transform hover:scale-110">
                        <Camera size={18} />
                        <input type="file" accept="image/*" className="hidden" onChange={handleAdminProfileImageSelect} />
                    </label>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 ml-1">새 비밀번호</label>
                    <input 
                        type="password" 
                        value={newAdminPassword} 
                        onChange={(e) => setNewAdminPassword(e.target.value)} 
                        placeholder="변경할 비밀번호 (6자리 이상)"
                        className="w-full px-4 py-2.5 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm" 
                    />
                </div>
                <div>
                    <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호 확인</label>
                    <input 
                        type="password" 
                        value={confirmAdminPassword} 
                        onChange={(e) => setConfirmAdminPassword(e.target.value)} 
                        placeholder="비밀번호 다시 입력" 
                        className="w-full px-4 py-2.5 bg-[#f2f4f6] border border-transparent rounded-xl outline-none focus:bg-white focus:border-[#3182f6] focus:ring-4 focus:ring-[#3182f6]/10 transition-all font-semibold text-[#191f28] text-sm" 
                    />
                </div>
                <button 
                    onClick={handleSaveAdminProfile} 
                    disabled={profileLoading} 
                    className="w-full py-3.5 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-xl font-bold transition shadow-sm mt-2 disabled:bg-gray-300 text-sm"
                >
                    {profileLoading ? '저장 중...' : '프로필 저장하기'}
                </button>
            </div>
        </div>
    );
};

export default ProfileSettings;
