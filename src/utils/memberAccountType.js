// Classification comes from explicit membership state, never an Auth lookup
// failure or absence of an email returned by a login-candidate query.
export const isVisitorOrTemporary = user => !!user && (
    ['게스트','미가입'].includes(user.user_group) || user.preferences?.is_temporary===true
);
