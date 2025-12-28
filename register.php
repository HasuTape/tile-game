<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register - Tile Game</title>
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
        .success {
            background: #388e3c;
            color: white;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Register</h1>
        
        <?php
        require_once 'config.php';
        
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $username = $_POST['username'] ?? '';
            $email = $_POST['email'] ?? '';
            $password = $_POST['password'] ?? '';
            $confirm_password = $_POST['confirm_password'] ?? '';
            
            if ($username && $email && $password && $confirm_password) {
                if ($password !== $confirm_password) {
                    echo '<div class="error">Passwords do not match</div>';
                } elseif (strlen($password) < 6) {
                    echo '<div class="error">Password must be at least 6 characters</div>';
                } else {
                    // Check if username or email exists
                    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
                    $stmt->execute([$username, $email]);
                    
                    if ($stmt->fetch()) {
                        echo '<div class="error">Username or email already exists</div>';
                    } else {
                        // Create user
                        $password_hash = password_hash($password, PASSWORD_DEFAULT);
                        $stmt = $pdo->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
                        
                        if ($stmt->execute([$username, $email, $password_hash])) {
                            echo '<div class="success">Registration successful! <a href="login.php" style="color: white;">Login here</a></div>';
                        } else {
                            echo '<div class="error">Registration failed. Please try again.</div>';
                        }
                    }
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
                <label for="email">Email:</label>
                <input type="email" id="email" name="email" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <div class="form-group">
                <label for="confirm_password">Confirm Password:</label>
                <input type="password" id="confirm_password" name="confirm_password" required>
            </div>
            
            <button type="submit" class="btn">Register</button>
        </form>
        
        <div class="links">
            <a href="login.php">Already have an account?</a>
            <a href="index.php">Back to Game</a>
        </div>
    </div>
</body>
</html>