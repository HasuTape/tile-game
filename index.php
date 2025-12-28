<?php require_once 'config.php'; ?>
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tile Game</title>
    <link rel="icon" href="Logo.ico" type="image/x-icon">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            background: #17161F; 
            color: #fff; 
            margin: 0; 
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { 
            text-align: center; 
            padding: 40px;
        }
        .logo {
            width: 200px;
            height: 200px;
            margin: 0 auto 30px;
        }
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        h1 { 
            color: #fff; 
            margin: 0 0 40px 0;
            font-size: 48px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .user-info {
            background: #333;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            border: 2px solid #555;
        }
        .game-links {
            display: flex;
            flex-direction: column;
            gap: 20px;
            align-items: center;
        }
        .game-links a { 
            display: block;
            background: #333;
            color: white;
            padding: 20px 60px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 20px;
            font-weight: bold;
            border: 2px solid #555;
            transition: all 0.2s;
            min-width: 200px;
        }
        .game-links a:hover { 
            background: #444;
            border-color: #666;
            transform: translateY(-2px);
        }
        .game-links a:active {
            transform: translateY(0);
        }
        .auth-links {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 20px;
        }
        .auth-links a {
            background: #555;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 6px;
            font-size: 14px;
            border: 2px solid #666;
            transition: all 0.2s;
        }
        .auth-links a:hover {
            background: #666;
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <img src="Logo.png" alt="Tile Game Logo">
        </div>
        <h1>Tile Game</h1>
        
        <?php if (isLoggedIn()): ?>
            <div class="user-info">
                Welcome back, <strong><?= htmlspecialchars($_SESSION['username']) ?></strong>!
            </div>
        <?php endif; ?>
        
        <div class="game-links">
            <a href="game.html">Play Game</a>
            <a href="editor.html">Level Editor</a>
            <a href="community.php">Community Levels</a>
        </div>
        
        <div class="auth-links">
            <?php if (isLoggedIn()): ?>
                <a href="profile.php">Profile</a>
                <a href="logout.php">Logout</a>
            <?php else: ?>
                <a href="login.php">Login</a>
                <a href="register.php">Register</a>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>