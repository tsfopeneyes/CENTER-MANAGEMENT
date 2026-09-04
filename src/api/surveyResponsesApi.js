const check = result => {
    if (result.error) throw result.error;
    return result.data;
};

const rpcUnavailable = error => ['42883', 'PGRST202'].includes(error?.code);

export const setSurveyResponseAggregationExcluded = async (client, responseId, shouldExclude) => {
    const rpcResult = await client.rpc('set_survey_response_aggregation_excluded', {
        response_id: responseId,
        should_exclude: shouldExclude
    });
    if (!rpcResult.error) return rpcResult.data;
    if (!rpcUnavailable(rpcResult.error)) throw rpcResult.error;

    // Direct-table fallback for deployments where the RPC schema cache has not
    // refreshed yet. The database policy still requires an administrator.
    return check(await client
        .from('checkin_surveys')
        .update({
            aggregation_excluded: shouldExclude,
            aggregation_excluded_at: shouldExclude ? new Date().toISOString() : null,
            aggregation_excluded_by: shouldExclude ? (await client.auth.getUser()).data.user?.id || null : null
        })
        .eq('id', responseId)
        .select()
        .single());
};

export const deleteSurveyWithResponses = async (client, surveyId) => {
    // Delete only responses explicitly linked to this survey. Assignments are
    // removed by their existing ON DELETE CASCADE relationship.
    const responses = await client.from('checkin_surveys').delete().eq('survey_id', surveyId).select('id');
    if (responses.error) throw responses.error;
    const survey = await client.from('surveys').delete().eq('id', surveyId).select('id').single();
    if (survey.error) throw survey.error;
    return { survey_id: surveyId, deleted_responses: responses.data?.length || 0 };
};
