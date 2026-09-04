import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../../../supabaseClient';
import { userApi } from '../../../../api/userApi';
import { normalizeSchoolName } from '../../../../utils/schoolUtils';

export const useAdminSchool = ({ users, refreshDashboardData }) => {
    const [schools, setSchools] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSchoolName, setSelectedSchoolName] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isSettingsMode, setIsSettingsMode] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState('ALL');
    const [adminTab, setAdminTab] = useState('SCHOOLS'); // 'SCHOOLS', 'CALLING_FOREST', 'SNACKS'

    const [isAddSchoolModalOpen, setIsAddSchoolModalOpen] = useState(false);
    const [newSchoolName, setNewSchoolName] = useState('');
    const [addingSchool, setAddingSchool] = useState(false);

    const handleAddSchool = async () => {
        if (!newSchoolName.trim()) return;
        setAddingSchool(true);
        try {
            const existing = schools.find(s => normalizeSchoolName(s.name) === normalizeSchoolName(newSchoolName));
            if (existing) {
                alert('이미 등록된 학교입니다.');
                setAddingSchool(false);
                return;
            }
            const { error } = await supabase.from('schools').insert([{ name: newSchoolName.trim() }]);
            if (error) throw error;
            await fetchSchoolsAndLogsAndPrefs();
            setIsAddSchoolModalOpen(false);
            setNewSchoolName('');
        } catch (error) {
            alert('학교 추가 실패: ' + error.message);
        } finally {
            setAddingSchool(false);
        }
    };

    const handleDeleteSchool = async (schoolName) => {
        if (!confirm(`'${schoolName}' 학교를 삭제하시겠습니까?`)) return;
        try {
            const { error } = await supabase.from('schools').delete().eq('name', schoolName);
            if (error) throw error;
            await fetchSchoolsAndLogsAndPrefs();
        } catch (error) {
            alert('학교 삭제 실패: ' + error.message);
        }
    };

    // Persisted State (Initialize empty, load from DB)
    const [favorites, setFavorites] = useState([]);
    const favoritesRef = useRef([]);
    const favoriteSaveInProgressRef = useRef(false);
    const [viewMode, setViewMode] = useState('grid-lg');
    const [prefsLoading, setPrefsLoading] = useState(true);

    useEffect(() => {
        favoritesRef.current = favorites;
    }, [favorites]);

    const toggleFavorite = async (schoolName, e) => {
        e.stopPropagation();
        if (favoriteSaveInProgressRef.current) return;

        const adminUser = JSON.parse(localStorage.getItem('admin_user'));
        if (!adminUser?.id) {
            alert('로그인한 관리자 정보를 확인할 수 없어 즐겨찾기를 저장하지 못했습니다.');
            return;
        }

        favoriteSaveInProgressRef.current = true;
        const previousFavorites = favoritesRef.current;
        const newFavorites = previousFavorites.includes(schoolName)
            ? previousFavorites.filter(n => n !== schoolName)
            : [...previousFavorites, schoolName];
        const storageKey = `admin_school_favorites:${adminUser.id}`;

        favoritesRef.current = newFavorites;
        setFavorites(newFavorites);
        localStorage.setItem(storageKey, JSON.stringify(newFavorites));

        try {
            const savedPrefs = await userApi.updateUserPreferences(adminUser.id, { admin_school_favorites: newFavorites });
            const savedFavorites = savedPrefs?.admin_school_favorites;
            if (!Array.isArray(savedFavorites) || JSON.stringify(savedFavorites) !== JSON.stringify(newFavorites)) {
                throw new Error('저장된 즐겨찾기 정보를 확인하지 못했습니다.');
            }
        } catch (err) {
            favoritesRef.current = previousFavorites;
            setFavorites(previousFavorites);
            localStorage.setItem(storageKey, JSON.stringify(previousFavorites));
            console.error('Failed to sync favorites to DB', err);
            alert('즐겨찾기를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            favoriteSaveInProgressRef.current = false;
        }
    };

    const handleViewModeChange = async (mode) => {
        setViewMode(mode);
        const adminUser = JSON.parse(localStorage.getItem('admin_user'));
        if (adminUser?.id) {
            try {
                await userApi.updateUserPreferences(adminUser.id, { admin_school_view_mode: mode });
            } catch (err) {
                console.error("Failed to sync view mode to DB", err);
            }
        }
    };

    useEffect(() => {
        fetchSchoolsAndLogsAndPrefs();
    }, []);

    const fetchSchoolsAndLogsAndPrefs = async () => {
        setLoading(true);
        setPrefsLoading(true);

        try {
            // Run DB fetches in parallel
            const adminUser = JSON.parse(localStorage.getItem('admin_user'));
            const prefsPromise = adminUser?.id ? userApi.fetchUserPreferences(adminUser.id) : Promise.resolve({});
            const schoolsPromise = supabase.from('schools').select('*').order('name');
            const logsPromise = supabase.from('school_logs').select('*, users(name)').order('date', { ascending: false }, 'created_at', { ascending: false });

            const [prefs, { data: schoolData }, { data: logData }] = await Promise.all([
                prefsPromise,
                schoolsPromise,
                logsPromise
            ]);

            // Migrate from localStorage if DB is empty
            let needsMigration = false;
            let mergedPrefs = { ...prefs };

            const userFavoritesKey = adminUser?.id ? `admin_school_favorites:${adminUser.id}` : null;
            const accountLocalFavorites = userFavoritesKey
                ? JSON.parse(localStorage.getItem(userFavoritesKey) || 'null')
                : null;
            const legacyLocalFavorites = JSON.parse(localStorage.getItem('admin_school_favorites') || 'null');
            const localFavorites = accountLocalFavorites || legacyLocalFavorites || [];
            const localViewMode = localStorage.getItem('admin_school_view_mode') || 'grid-lg';

            if (!prefs.admin_school_favorites && localFavorites.length > 0) {
                mergedPrefs.admin_school_favorites = localFavorites;
                needsMigration = true;
            }
            if (!prefs.admin_school_view_mode && localViewMode) {
                mergedPrefs.admin_school_view_mode = localViewMode;
                needsMigration = true;
            }

            if (needsMigration && adminUser?.id) {
                await userApi.updateUserPreferences(adminUser.id, mergedPrefs);
                if (legacyLocalFavorites) localStorage.removeItem('admin_school_favorites');
            }

            const loadedFavorites = Array.isArray(mergedPrefs.admin_school_favorites)
                ? mergedPrefs.admin_school_favorites
                : localFavorites;
            favoritesRef.current = loadedFavorites;
            setFavorites(loadedFavorites);
            if (userFavoritesKey) localStorage.setItem(userFavoritesKey, JSON.stringify(loadedFavorites));
            setViewMode(mergedPrefs.admin_school_view_mode || 'grid-lg');

            setSchools(schoolData || []);
            setLogs(logData || []);
            setSchools(schoolData || []);
            setLogs(logData || []);
        } catch (error) {
            console.error('Error fetching schools and logs:', error);
        } finally {
            setLoading(false);
            setPrefsLoading(false);
        }
    };

    const staffList = useMemo(() => {
        return (users || []).filter(u => u.user_group === 'STAFF' || u.user_group === 'TEACHER');
    }, [users]);

    const schoolGroups = useMemo(() => {
        const adolescents = (users || []).filter(u => u.user_group === '청소년');
        const groups = {};

        const normalizedSchools = new Map();
        schools.forEach(s => {
            normalizedSchools.set(normalizeSchoolName(s.name), s);
        });

        // 1. First, create groups for all official schools (metadata)
        schools.forEach(s => {
            if (selectedRegion !== 'ALL') {
                if (selectedRegion === '미지정') {
                    if (s.region) return;
                } else if (s.region !== selectedRegion) {
                    return;
                }
            }
            const normName = normalizeSchoolName(s.name);
            groups[normName] = {
                name: s.name, // Use official name
                students: [],
                metadata: s
            };
        });

        // 2. Then, add students to those groups, creating new ones if necessary
        adolescents.forEach(u => {
            if (!u.school) return;
            const normName = normalizeSchoolName(u.school);

            const schoolMeta = normalizedSchools.get(normName) || schools.find(s => s.name === u.school);

            // Re-check region filter
            if (selectedRegion !== 'ALL') {
                const region = schoolMeta?.region || '미지정';
                if (region !== selectedRegion) return;
            }

            if (!groups[normName]) {
                groups[normName] = {
                    name: schoolMeta ? schoolMeta.name : u.school,
                    students: [],
                    metadata: schoolMeta || null
                };
            }
            groups[normName].students.push(u);
        });

        return Object.values(groups).filter(g =>
            g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (g.metadata?.club_name && g.metadata.club_name.toLowerCase().includes(searchTerm.toLowerCase()))
        ).sort((a, b) => {
            // Sort by Favorites first
            const isAFav = favorites.includes(a.name);
            const isBFav = favorites.includes(b.name);
            if (isAFav && !isBFav) return -1;
            if (!isAFav && isBFav) return 1;

            // Then schools with an assigned Seucheo team manager
            const isAConnected = Array.isArray(a.metadata?.manager_ids) && a.metadata.manager_ids.length > 0;
            const isBConnected = Array.isArray(b.metadata?.manager_ids) && b.metadata.manager_ids.length > 0;
            if (isAConnected && !isBConnected) return -1;
            if (!isAConnected && isBConnected) return 1;

            // Then alphabetical
            return a.name.localeCompare(b.name, 'ko');
        });
    }, [users, schools, searchTerm, selectedRegion, favorites]);

    // Derived State for Modal
    const targetSchool = useMemo(() => {
        if (!selectedSchoolName) return null;
        return schoolGroups.find(g => g.name === selectedSchoolName) || null;
    }, [schoolGroups, selectedSchoolName]);

    const handleOpenDetail = (group) => {
        setSelectedSchoolName(group.name);
        setIsDetailModalOpen(true);
        setIsSettingsMode(false);
    };

    const handleSaveMetadata = async (metadata) => {
        if (!targetSchool) return;
        try {
            // Filter out keys that don't exist as columns in the schools table
            const allowedKeys = ['region', 'club_type', 'club_name', 'manager_ids', 'teacher_name', 'meeting_time', 'snack_history'];
            const cleanMetadata = Object.keys(metadata)
                .filter(key => allowedKeys.includes(key))
                .reduce((obj, key) => {
                    obj[key] = metadata[key];
                    return obj;
                }, {});

            const existing = schools.find(s => s.name === targetSchool.name);
            let result;
            if (existing) {
                result = await supabase.from('schools').update(cleanMetadata).eq('id', existing.id);
            } else {
                result = await supabase.from('schools').insert([{ name: targetSchool.name, ...cleanMetadata }]);
            }

            if (result.error) throw result.error;
            await fetchSchoolsAndLogsAndPrefs();
            setIsSettingsMode(false);
            // No need to manually update selectedSchool, fetch will trigger re-render of schoolGroups -> targetSchool
        } catch (err) {
            alert('저장 실패: ' + err.message);
        }
    };

    const handleToggleLeader = async (student) => {
        const newStatus = !student.is_leader;
        const confirmMsg = newStatus
            ? `[${student.name}] 학생을 리더로 지정하시겠습니까?`
            : `[${student.name}] 학생의 리더 지정을 해제하시겠습니까?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            const { error } = await supabase
                .from('users')
                .update({ is_leader: newStatus })
                .eq('id', student.id);

            if (error) throw error;

            // Refresh data to update UI
            await refreshDashboardData();
        } catch (err) {
            console.error('Error toggling leader status:', err);
            alert('리더 상태 변경 실패: ' + err.message);
        }
    };


    return {
        schools, logs, loading, searchTerm, setSearchTerm,
        selectedSchoolName, setSelectedSchoolName,
        isDetailModalOpen, setIsDetailModalOpen,
        isSettingsMode, setIsSettingsMode,
        selectedRegion, setSelectedRegion,
        adminTab, setAdminTab,
        isAddSchoolModalOpen, setIsAddSchoolModalOpen,
        newSchoolName, setNewSchoolName,
        addingSchool, setAddingSchool,
        favorites, viewMode, prefsLoading,
        handleAddSchool, handleDeleteSchool,
        toggleFavorite, handleViewModeChange,
        fetchSchoolsAndLogsAndPrefs,
        staffList, schoolGroups, targetSchool,
        handleOpenDetail, handleSaveMetadata, handleToggleLeader
    };
};
