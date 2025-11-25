body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    } catch (error) {
    console.error('Error in horarios function:', error);
    return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal Server Error: ' + error.message }),
    };
}
};
