CREATE OR REPLACE FUNCTION accept_pact_invitation(
    p_invitation_id UUID,
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    v_invitation RECORD;
    v_pact RECORD;
    v_profile RECORD;
    v_member_exists BOOLEAN;
BEGIN
    -- 1. Get and lock invitation
    SELECT * INTO v_invitation 
    FROM invitations 
    WHERE id = p_invitation_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Invitation not found', 'status', 404);
    END IF;

    IF v_invitation.status != 'pending' THEN
        RETURN json_build_object('error', 'Invitation is no longer pending', 'status', 400);
    END IF;

    -- 2. Verify recipient
    IF v_invitation.invitation_type = 'username' AND v_invitation.invited_user_id != p_user_id THEN
        RETURN json_build_object('error', 'Forbidden', 'status', 403);
    END IF;

    -- 3. Get pact details
    SELECT * INTO v_pact FROM pacts WHERE id = v_invitation.pact_id;
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Pact not found', 'status', 404);
    END IF;

    -- 4. Check if already a member
    SELECT EXISTS(SELECT 1 FROM pact_members WHERE pact_id = v_invitation.pact_id AND user_id = p_user_id AND status = 'active') INTO v_member_exists;
    IF v_member_exists THEN
        -- Mark invitation as accepted anyway since they are already a member
        UPDATE invitations SET status = 'accepted' WHERE id = p_invitation_id;
        RETURN json_build_object('success', true);
    END IF;

    -- 5. Get and lock profile for balance check
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Profile not found', 'status', 404);
    END IF;

    -- 6. Check balance
    IF v_profile.coin_balance < v_pact.stake_amount THEN
        RETURN json_build_object('error', 'Insufficient balance. Need 🪙 ' || v_pact.stake_amount, 'status', 400);
    END IF;

    -- 7. Atomic reservation
    UPDATE profiles 
    SET coin_balance = coin_balance - v_pact.stake_amount,
        reserved_coins = reserved_coins + v_pact.stake_amount
    WHERE id = p_user_id;

    -- 8. Create pact member
    INSERT INTO pact_members (pact_id, user_id, role, status)
    VALUES (v_invitation.pact_id, p_user_id, 'member', 'active')
    ON CONFLICT (pact_id, user_id) DO UPDATE SET status = 'active', role = 'member';

    -- 9. Mark invitation accepted
    UPDATE invitations SET status = 'accepted' WHERE id = p_invitation_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
