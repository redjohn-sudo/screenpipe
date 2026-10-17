// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Regression: memory search must not fail when a text query is combined with
//! the legacy `tags` filter, or when the query is only whitespace/quotes.

use screenpipe_db::DatabaseManager;

async fn db() -> (tempfile::TempDir, DatabaseManager) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite");
    let db = DatabaseManager::new(path.to_str().unwrap(), Default::default())
        .await
        .unwrap();
    (dir, db)
}

#[tokio::test]
async fn text_query_with_tags_filter_returns_matches() {
    let (_dir, db) = db().await;
    let id = db
        .insert_memory(
            "prefers dark mode",
            "user",
            None,
            Some(r#"["ui"]"#),
            0.5,
            None,
        )
        .await
        .unwrap();
    db.insert_memory(
        "prefers dark roast",
        "user",
        None,
        Some(r#"["coffee"]"#),
        0.5,
        None,
    )
    .await
    .unwrap();

    let found = db
        .list_memories(
            Some("dark"),
            None,
            Some("ui"),
            None,
            None,
            None,
            50,
            0,
            None,
            None,
            &[],
        )
        .await
        .expect("text query + tags filter must not be an SQL error");
    assert_eq!(found.iter().map(|m| m.id).collect::<Vec<_>>(), vec![id]);

    let total = db
        .count_memories(Some("dark"), None, Some("ui"), None, None, None, &[])
        .await
        .expect("count with text query + tags filter must not be an SQL error");
    assert_eq!(total, 1);
}

#[tokio::test]
async fn blank_query_behaves_like_no_query() {
    let (_dir, db) = db().await;
    db.insert_memory("hello world", "user", None, None, 0.5, None)
        .await
        .unwrap();

    for blank in [" ", "\"", "\"\"", "  \t "] {
        let found = db
            .list_memories(
                Some(blank),
                None,
                None,
                None,
                None,
                None,
                50,
                0,
                None,
                None,
                &[],
            )
            .await
            .unwrap_or_else(|e| panic!("query {blank:?} must not be an SQL error: {e}"));
        assert_eq!(found.len(), 1, "query {blank:?}");
        let total = db
            .count_memories(Some(blank), None, None, None, None, None, &[])
            .await
            .unwrap_or_else(|e| panic!("count {blank:?} must not be an SQL error: {e}"));
        assert_eq!(total, 1, "query {blank:?}");
    }
}
