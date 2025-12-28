<?php
require_once 'config.php';

// Destroy session
session_destroy();

// Redirect to main page
header('Location: index.php');
exit;
?>