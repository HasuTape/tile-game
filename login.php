<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Tile Game</title>
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
            background: #333;
            padding: 40px;
            border-radius: 12px;
            border: 2px solid #555;
            width: 100%;
            max-width: 400px;
        }
        h1 { 
            text-align: center;
            margin: 0 0 30px 0;
            font-size: 32px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        input[type="text"], input[type="email"], input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #555;
            border-radius: 6px;
            background: #444;
            color: #fff;
            font-size: 16px;
            box-sizing: border-box;
        }
        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus {
            border-color: #666;
            outline: none;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: #555;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn:hover {
            background: #666;
        }
        .links {
            text-align: center;
            margin-top: 20px;
        }
        .links a {
            color: #ccc;
            text-decoration: none;
            margin: 0 10px;
        }
        .links a:hover {
            color: #fff;
        }
        .error {
            background: #d32f2f;
            color: white;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Login</h1>
        
        <?php
        require_once 'config.php';
        
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $username = $_POST['username'] ?? '';
            $password = $_POST['password'] ?? '';
            
            if ($username && $password) {
                $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
                $stmt->execute([$username]);
                $user = $stmt->fetch();
                
                if ($user && password_verify($password, $user['password_hash'])) {
                    $_SESSION['user_id'] = $user['id'];
                    $_SESSION['username'] = $user['username'];
                    
                    // Update last login
                    $stmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
                    $stmt->execute([$user['id']]);
                    
                    header('Location: index.php');
                    exit;
                } else {
                    echo '<div class="error">Invalid username or password</div>';
                }
            } else {
                echo '<div class="error">Please fill in all fields</div>';
            }
        }
        ?>
        
        <form method="POST">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit" class="btn">Login</button>
        </form>
        
        <div class="links">
            <a href="register.php">Register</a>
            <a href="index.php">Back to Game</a>
        </div>
    </div>
</body>
</html>