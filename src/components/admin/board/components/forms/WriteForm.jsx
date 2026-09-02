import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../../../supabaseClient';
import { noticesApi } from '../../../../../api/noticesApi';
import { CATEGORIES, MAX_IMAGES, MAX_PROGRAM_HAIFN_REWARD } from '../../utils/constants';
import { generateProgramInfoHtml, prepareNoticeForEdit, joinDateTime } from '../../utils/noticeHelpers';
import { compressImage } from '../../../../../utils/imageUtils';
import { fromKstInput, getMissingProgramDetails } from '../../../../../utils/programRecruitment';
import { isAccountAuthEnabled } from '../../../../../auth/accountAuthRuntime';
import { cachedAccountProfileId, uploadAccountImage } from '../../../../../auth/accountMedia';

// Hooks
import useNoticeForm from '../../hooks/useNoticeForm';
import useImageUpload from '../../hooks/useImageUpload';

// Sections
import BasicInfoSection from './BasicInfoSection';
import ProgramInfoSection from './ProgramInfoSection';
import PollBuilder from './PollBuilder';
import PostSettings from './PostSettings';

// Image Components
import ImageUploader from '../images/ImageUploader';
import ImagePreviewList from '../images/ImagePreviewList';
import ImageCropModal from '../images/ImageCropModal';

const WriteForm = ({ mode, editNoticeId, existingNotice, onSave, onCancel, flat = false, initialProgramDate }) => {
    const [isSaving, setIsSaving] = useState(false);

    const {
        formData,
        setFormData,
        updateField,
        resetForm,
        validateForm
    } = useNoticeForm(mode);

    useEffect(() => {
        if (!editNoticeId && initialProgramDate) setFormData(previous => ({ ...previous, program_date: previous.program_date || initialProgramDate }));
    }, [editNoticeId, initialProgramDate, setFormData]);

    const {
        selectedFiles,
        existingImages,
        setExistingImages,
        onDrop,
        openEditor,
        removeFile,
        handleDeleteExistingImage,
        resetImages,
        handleImageDragStart,
        handleImageDrop,
        handleImageDragOver,
        editorState
    } = useImageUpload();

    // Initialize form for editing
    useEffect(() => {
        if (editNoticeId && existingNotice) {
            const prepared = prepareNoticeForEdit(existingNotice);
            setFormData(prepared);
            if (existingNotice.images) {
                setExistingImages(existingNotice.images);
            } else if (existingNotice.image_url) {
                setExistingImages([existingNotice.image_url]);
            }
        }
    }, [editNoticeId, existingNotice, setFormData, setExistingImages]);

    const handleSaveNotice = async (e) => {
        e.preventDefault();

        const validation = validateForm();
        if (!validation.isValid) {
            alert(validation.message);
            return;
        }

        setIsSaving(true);
        try {
            const isProgram = mode === CATEGORIES.PROGRAM;
            let finalContent = formData.content;

            if (isProgram) {
                let validJoinedDate = '';
                const pVal = formData.program_date;
                if (pVal && pVal !== '') {
                    const parsed = new Date(pVal);
                    if (!isNaN(parsed.getTime())) {
                        validJoinedDate = pVal;
                    }
                }

                const combinedDateObj = {
                    ...formData,
                    program_date: validJoinedDate
                };
                const infoBlock = generateProgramInfoHtml(combinedDateObj);
                finalContent = infoBlock + finalContent;
            }

            // Image Handle Logic
            const uploadedUrls = [...existingImages];

            // Setup Storage
            if (selectedFiles.length > 0) {
                for (const item of selectedFiles) {
                    const file = item.file;
                    const compressedFile = await compressImage(file);
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Math.random()}.${fileExt}`;

                    let publicUrl;
                    if(isAccountAuthEnabled())publicUrl=await uploadAccountImage({profileId:cachedAccountProfileId(),kind:'notice',file:compressedFile});
                    else {
                    const { error: uploadError } = await supabase.storage
                        .from('notice-images')
                        .upload(fileName, compressedFile);

                    if (uploadError) throw uploadError;

                    ({ data: { publicUrl } } = supabase.storage
                        .from('notice-images')
                        .getPublicUrl(fileName));
                    }

                    uploadedUrls.push(publicUrl);
                }
            }

            // Handle Poll Images
            const processedPollOptions = [];
            if (formData.is_poll && formData.poll_options) {
                for (let i = 0; i < formData.poll_options.length; i++) {
                    const opt = formData.poll_options[i];
                    let finalUrl = opt.image_url || '';

                    if (opt.imageFile) {
                        const compressedFile = await compressImage(opt.imageFile);
                        const fileExt = opt.imageFile.name.split('.').pop();
                        const fileName = `poll_${Date.now()}_${Math.random()}.${fileExt}`;

                        if(isAccountAuthEnabled())finalUrl=await uploadAccountImage({profileId:cachedAccountProfileId(),kind:'notice',file:compressedFile});
                        else {
                        const { error: uploadError } = await supabase.storage
                            .from('notice-images')
                            .upload(fileName, compressedFile);

                        if (uploadError) throw uploadError;

                        const { data: { publicUrl } } = supabase.storage
                            .from('notice-images')
                            .getPublicUrl(fileName);
                        
                        finalUrl = publicUrl;
                        }
                    }

                    processedPollOptions.push({
                        id: opt.id,
                        title: opt.title,
                        description: opt.description || '',
                        image_url: finalUrl
                    });
                }
            }

            const noticeData = {
                title: formData.title,
                short_description: formData.short_description || '',
                content: finalContent,
                category: mode,
                is_sticky: formData.is_sticky,
                send_push: formData.send_push || false,
                images: uploadedUrls,
                image_url: uploadedUrls.length > 0 ? uploadedUrls[0] : null,
                is_recruiting: formData.is_recruiting,
                recruitment_deadline: (formData.is_recruiting && formData.recruitment_deadline) 
                    ? fromKstInput(formData.recruitment_deadline)
                    : null,
                target_regions: formData.target_regions,
                is_poll: formData.is_poll,
                allow_multiple_votes: formData.is_poll ? formData.allow_multiple_votes : false,
                poll_deadline: (formData.is_poll && formData.poll_deadline) 
                    ? new Date(formData.poll_deadline).toISOString() 
                    : null,
                poll_options: formData.is_poll ? processedPollOptions : []
            };

            if (isProgram) {
                const challengeHasTime = formData.is_challenge && formData.challenge_has_time === true;
                let finalProgramDate = null;
                const pVal = (formData.is_challenge && !challengeHasTime)
                    ? ''
                    : formData.program_date;
                if (pVal && pVal !== '') {
                    const parsedDate = new Date(pVal);
                    if (!isNaN(parsedDate.getTime())) {
                        finalProgramDate = fromKstInput(pVal);
                    }
                }
                noticeData.program_date = finalProgramDate;
                noticeData.recruitment_start_at = formData.is_recruiting ? fromKstInput(formData.recruitment_start_at) : null;
                noticeData.recruitment_details_ready = getMissingProgramDetails(formData).length === 0;
                noticeData.program_duration = (formData.is_challenge && !challengeHasTime)
                    ? ''
                    : (formData.program_duration || '');
                noticeData.program_location = formData.program_location || '';
                
                noticeData.program_type = formData.program_type;
                
                const isCenter = !formData.program_type || formData.program_type === 'CENTER';
                const isHostEnabled = formData.enable_hosts === true;
                const allConfiguredHosts = (formData.hosts || []).filter(h => h && h.host_id);
                const activeHosts = (isCenter && isHostEnabled) ? allConfiguredHosts : [];
                
                noticeData.hosts = activeHosts;
                noticeData.host_id = activeHosts[0]?.host_id || null;
                noticeData.host_one_liner = activeHosts[0]?.one_liner || null;

                noticeData.max_capacity = formData.max_capacity ? parseInt(formData.max_capacity) : null;
                noticeData.is_leader_only = formData.is_leader_only;
                const requestedHaifnReward = parseInt(formData.haifn_reward, 10) || 0;
                noticeData.haifn_reward = Math.min(
                    MAX_PROGRAM_HAIFN_REWARD,
                    Math.max(0, requestedHaifnReward)
                );
                noticeData.is_review_required = formData.is_review_required || false;
                                noticeData.is_private = formData.is_private || false;
                noticeData.is_challenge = formData.is_challenge || false;
                noticeData.challenge_missions = formData.challenge_missions || [];
                noticeData.challenge_success_message = formData.challenge_success_message || '';
                noticeData.challenge_show_haifn_btn = formData.challenge_show_haifn_btn || false;
                const gp = formData.guest_properties || { allow_guest: true, require_school: true, require_phone: true };
                const configuredHosts = (formData.hosts || []).filter(h => h && h.host_id);
                noticeData.guest_properties = {
                    ...gp,
                    require_school: true,
                    require_phone: true,
                    custom_fields: (Array.isArray(gp.custom_fields) ? gp.custom_fields : [])
                        .filter(field => String(field?.label || '').trim())
                        .map(field => ({
                            id: field.id,
                            label: String(field.label).trim(),
                            type: ['text', 'textarea', 'select'].includes(field.type) ? field.type : 'text',
                            required: field.required === true,
                            options: field.type === 'select' ? (field.options || []).filter(Boolean) : [],
                        })),
                    cached_hosts: configuredHosts.length > 0 ? configuredHosts : (gp.cached_hosts || []),
                    challenge_has_time: challengeHasTime,
                    enable_post_program_button: formData.enable_post_program_button || false,
                    post_program_button_trigger: formData.post_program_button_trigger || 'start_time',
                    post_program_button_offset_minutes: Number(formData.post_program_button_offset_minutes || 0),
                    post_program_button_name: formData.post_program_button_name || '',
                    post_program_button_content: formData.post_program_button_content || '',
                    post_program_button_link: formData.post_program_button_link || '',
                    enable_group_assignment: formData.enable_group_assignment || false,
                    group_count: formData.group_count || 4,
                    enable_random_questions: formData.enable_random_questions || false,
                    random_questions: formData.random_questions || [],
                    enable_feedback: formData.enable_feedback || false,
                    custom_feedback_config: formData.custom_feedback_config || { questions: [] }
                };
                const startDate = formData.program_start_date || formData.program_date;
                const endDate = formData.program_end_date;
                const days = formData.program_days || [];

                const isPeriodRequired = !formData.is_recruiting || formData.is_challenge;
                noticeData.program_start_date = (isPeriodRequired && startDate)
                    ? new Date(startDate).toISOString().split('T')[0]
                    : null;
                noticeData.program_end_date = (isPeriodRequired && endDate)
                    ? new Date(endDate).toISOString().split('T')[0]
                    : null;
                noticeData.program_days = !formData.is_recruiting ? days : [];

                if (!editNoticeId && !noticeData.program_status) {
                    noticeData.program_status = 'ACTIVE';
                }
            }

            if (editNoticeId) {
                await noticesApi.update(editNoticeId, noticeData);
            } else {
                await noticesApi.create(noticeData);
            }

            onSave(noticeData);

        } catch (error) {
            console.error('Save error:', error);
            if (['PGRST204', '42703'].includes(error.code) && /recruitment_(start_at|details_ready)/.test(error.message || '')) {
                alert('모집 기간 저장을 위한 DB 변경안이 아직 적용되지 않았습니다. 운영 DB 적용 후 다시 저장해주세요. 입력 내용은 유지됩니다.');
                return;
            }
            alert('저장 중 오류가 발생했습니다: ' + (error.message || error.details || JSON.stringify(error)));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form 
            id="write-form"
            onSubmit={handleSaveNotice} 
            className={flat 
                ? "animate-fade-in-up space-y-6 md:space-y-8" 
                : "bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-fade-in-up space-y-6 md:space-y-8"
            }
        >
            <div className="space-y-6 md:space-y-8">
                
                <BasicInfoSection 
                    mode={mode} 
                    title={formData.title} 
                    shortDescription={formData.short_description}
                    content={formData.content} 
                    onTitleChange={(v) => updateField('title', v)} 
                    onShortDescChange={(v) => updateField('short_description', v)}
                    onContentChange={(v) => updateField('content', v)} 
                />

                {mode === CATEGORIES.PROGRAM && (
                    <ProgramInfoSection formData={formData} updateField={updateField} flat={flat} />
                )}
                
                <PollBuilder formData={formData} updateField={updateField} />

                <PostSettings formData={formData} updateField={updateField} mode={mode} />

                {/* --- Image Upload Section --- */}
                <div className="space-y-4 pt-4 border-t border-gray-50">
                    <p className="text-xs font-bold text-gray-400 ml-1">상세 이미지 <span className="text-blue-500 font-bold ml-2">최대 {MAX_IMAGES}장</span></p>
                    
                    <ImagePreviewList 
                        existingImages={existingImages}
                        selectedFiles={selectedFiles}
                        onDragStart={handleImageDragStart}
                        onDrop={handleImageDrop}
                        onDragOver={handleImageDragOver}
                        onDeleteExisting={handleDeleteExistingImage}
                        onDeleteSelected={removeFile}
                        onEditSelected={openEditor}
                    />

                    {(existingImages.length + selectedFiles.length) < MAX_IMAGES && (
                        <ImageUploader 
                            onDrop={onDrop} 
                            currentCount={existingImages.length + selectedFiles.length} 
                        />
                    )}
                </div>

                {/* --- Action Buttons --- */}
                <div className="flex gap-4 pt-8">
                    <button 
                        type="button" 
                        onClick={onCancel} 
                        className="flex-1 py-4 bg-gray-50 text-gray-600 rounded-2xl font-bold hover:bg-gray-100 transition-all border border-gray-100"
                    >
                        취소하기
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSaving} 
                        className={`flex-1 py-4 text-white rounded-2xl font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.15)] 
                        ${isSaving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_25px_rgba(37,99,235,0.3)] hover:-translate-y-0.5'}`}
                    >
                        {isSaving ? '저장 중...' : (editNoticeId ? '수정하기' : '등록하기')}
                    </button>
                </div>
            </div>

            <ImageCropModal 
                isOpen={editorState.showEditor}
                imageSrc={editorState.editorImageSrc}
                crop={editorState.crop}
                zoom={editorState.zoom}
                rotation={editorState.rotation}
                onCropChange={editorState.setCrop}
                onZoomChange={editorState.setZoom}
                onRotationChange={editorState.setRotation}
                onCropComplete={(croppedArea, croppedAreaPixels) => editorState.setCroppedAreaPixels(croppedAreaPixels)}
                onSave={editorState.saveEditedImage}
                onClose={() => editorState.setShowEditor(false)}
            />
        </form>
    );
};

WriteForm.propTypes = {
    mode: PropTypes.string.isRequired,
    editNoticeId: PropTypes.string,
    existingNotice: PropTypes.object,
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    flat: PropTypes.bool
};

export default React.memo(WriteForm);
