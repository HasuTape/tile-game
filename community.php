<?php 
require_once 'config.php';

// Handle level rating
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['rate_level'])) {
    requireLogin();
    
    $level_id = (int)$_POST['level_id'];
    $rating = (int)$_POST['rating'];
    $comment = $_POST['comment'] ?? '';
    
    if ($rating >= 1 && $rating <= 5) {
        // Insert or update rating
        $stmt = $pdo->prepare("INSERT INTO level_ratings (user_id, level_id, rating, comment) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = ?, comment = ?");
        $stmt->execute([$_SESSION['user_id'], $level_id, $rating, $comment, $rating, $comment]);
        
        // Update average rating
        $stmt = $pdo->prepare("UPDATE community_levels SET avg_rating = (SELECT AVG(rating) FROM level_ratings WHERE level_id = ?), ratings_count = (SELECT COUNT(*) FROM level_ratings WHERE level_id = ?) WHERE id = ?");
        $stmt->execute([$level_id, $level_id, $level_id]);
    }
}

// Get community levels
$stmt = $pdo->prepare("SELECT cl.*, u.username FROM community_levels cl JOIN users u ON cl.user_id = u.id WHERE cl.published = 1 ORDER BY cl.created_at DESC");
$stmt->execute();
$levels = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Community Levels - Tile Game</title>
    <link rel="icon" href="Logo.ico" type="image/x-icon">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            background: #17161F; 
            color: #fff; 
            margin: 0; 
            padding: 20px;
        }
        .container { 
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 { 
            text-align: center;
            margin-bottom: 30px;
        }
        .level-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        .level-card {
            background: #333;
            border: 2px solid #555;
            border-radius: 12px;
            padding: 20px;
            transition: transform 0.2s;
        }
        .level-card:hover {
            transform: translateY(-2px);
        }
        .level-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .level-meta {
            color: #ccc;
            font-size: 14px;
            margin-bottom: 15px;
        }
        .level-description {
            margin-bottom: 15px;
            line-height: 1.4;
        }
        .level-stats {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            font-size: 14px;
        }
        .rating {
            color: #ffd700;
        }
        .btn {
            background: #555;
            color: white;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-right: 10px;
            transition: background 0.2s;
        }
        .btn:hover {
            background: #666;
        }
        .rating-form {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #555;
        }
        .rating-form select, .rating-form textarea {
            background: #444;
            color: #fff;
            border: 2px solid #555;
            border-radius: 4px;
            padding: 8px;
            margin: 5px 0;
        }
        .rating-form textarea {
            width: 100%;
            height: 60px;
            resize: vertical;
            box-sizing: border-box;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #ccc;
            text-decoration: none;
        }
        .back-link:hover {
            color: #fff;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="index.php" class="back-link">← Back to Main Menu</a>
        
        <h1>Community Levels</h1>
        
        <div class="level-grid">
            <?php foreach ($levels as $level): ?>
                <div class="level-card">
                    <div class="level-title"><?= htmlspecialchars($level['title']) ?></div>
                    <div class="level-meta">
                        By <?= htmlspecialchars($level['username']) ?> • 
                        <?= date('M j, Y', strtotime($level['created_at'])) ?>
                    </div>
                    
                    <?php if ($level['description']): ?>
                        <div class="level-description"><?= htmlspecialchars($level['description']) ?></div>
                    <?php endif; ?>
                    
                    <div class="level-stats">
                        <span>Difficulty: <?= $level['difficulty'] ?></span>
                        <span>Plays: <?= $level['plays_count'] ?></span>
                        <span class="rating">
                            ★ <?= number_format($level['avg_rating'], 1) ?> (<?= $level['ratings_count'] ?>)
                        </span>
                    </div>
                    
                    <a href="play_community.php?id=<?= $level['id'] ?>" class="btn">Play Level</a>
                    
                    <?php if (isLoggedIn()): ?>
                        <form method="POST" class="rating-form">
                            <input type="hidden" name="level_id" value="<?= $level['id'] ?>">
                            <div>
                                <label>Rate this level:</label>
                                <select name="rating" required>
                                    <option value="">Select rating</option>
                                    <option value="1">1 Star</option>
                                    <option value="2">2 Stars</option>
                                    <option value="3">3 Stars</option>
                                    <option value="4">4 Stars</option>
                                    <option value="5">5 Stars</option>
                                </select>
                            </div>
                            <textarea name="comment" placeholder="Leave a comment (optional)"></textarea>
                            <button type="submit" name="rate_level" class="btn">Submit Rating</button>
                        </form>
                    <?php else: ?>
                        <p style="font-size: 14px; color: #ccc; margin-top: 15px;">
                            <a href="login.php">Login</a> to rate and comment on levels
                        </p>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
        
        <?php if (empty($levels)): ?>
            <p style="text-align: center; color: #ccc; margin-top: 50px;">
                No community levels available yet. Be the first to create one!
            </p>
        <?php endif; ?>
    </div>
</body>
</html>